import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('smoke.sh')
MOCK_CURL = r'''#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
url = args[-1]
if url == 'https://galaxymovies.app/':
    if os.environ.get('APEX_EXIT'):
        print('curl: connection failed')
        sys.exit(int(os.environ['APEX_EXIT']))
    headers = os.environ.get('APEX_HEADERS', '')
    print('HTTP/2 ' + os.environ['APEX_CODE'] + '\r')
    print(headers + '\r\n')
    print(os.environ['APEX_CODE'] + ' ' + os.environ.get('APEX_URL', ''), end='')
else:
    print('HTTP/2 200\r\n\r\nTrending Fight Club tv/1399 Netflix Sitemap urlset')
    print('"provider":"netflix" smoke-test-key')
    print('200', end='')
'''


class SmokeTests(unittest.TestCase):
    def probe(self, code='308', url='https://www.galaxymovies.app/', headers='', curl_exit='', level='full'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'scripts').mkdir()
            (root / 'src/lib').mkdir(parents=True)
            (root / 'scripts/smoke.sh').write_text(SCRIPT.read_text())
            (root / 'src/lib/indexnow.ts').write_text("const INDEXNOW_KEY = 'smoke-test-key'\n")
            curl = root / 'curl'
            curl.write_text(MOCK_CURL)
            curl.chmod(0o755)
            env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}',
                       SMOKE_BASE='https://smoke.invalid', SMOKE_LEVEL=level,
                       APEX_CODE=code, APEX_URL=url, APEX_HEADERS=headers, APEX_EXIT=curl_exit)
            return subprocess.run(['bash', str(root / 'scripts/smoke.sh')],
                                  env=env, text=True, capture_output=True)

    def test_canonical_redirects(self):
        for code in ('301', '302', '303', '307', '308'):
            with self.subTest(code=code):
                result = self.probe(code=code)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('ok   apex -> www redirect', result.stdout)
                self.assertIn('(0 skipped)', result.stdout)

    def test_managed_challenge_is_explicitly_skipped(self):
        result = self.probe(code='403', url='', headers='Cf-Mitigated: challenge')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('www redirect not verified', result.stdout)
        self.assertIn('(1 skipped)', result.stdout)
        self.assertNotIn('ok   apex -> www redirect', result.stdout)

    def test_real_failures_remain_failures(self):
        for code, url, headers in (
            ('403', '', ''),
            ('500', '', 'cf-mitigated: challenge'),
            ('200', '', ''),
            ('308', 'https://wrong.invalid/', ''),
            ('308', 'https://www.galaxymovies.app.evil.invalid/', ''),
            ('304', 'https://www.galaxymovies.app/', ''),
            ('403', '', 'x-other: cf-mitigated: challenge'),
            ('403', '', 'cf-mitigated: challenge-extra'),
        ):
            with self.subTest(code=code, url=url, headers=headers):
                result = self.probe(code=code, url=url, headers=headers)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn('FAIL apex redirect', result.stdout)

    def test_transport_error_fails(self):
        result = self.probe(curl_exit='7')
        self.assertEqual(result.returncode, 1)
        self.assertIn('FAIL apex redirect (curl:', result.stdout)

    def test_core_omits_apex(self):
        result = self.probe(curl_exit='7', level='core')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('apex', result.stdout)


if __name__ == '__main__':
    unittest.main()
