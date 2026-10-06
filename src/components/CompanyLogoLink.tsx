import NextLink from 'next/link'
import { Box } from '@chakra-ui/react';
import ProductionLogo from './ProductionLogo'
import type { ProductionCompany } from '../types/tmdb'

export default function CompanyLogoLink({
  href,
  company
}: {
  href: string
  company: Pick<ProductionCompany, 'name' | 'logo_path'>
}) {
  return (
    <NextLink href={href} passHref>
      <Box
        as='span'
        cursor='pointer'
        transition='all 0.2s ease-in-out'
        _hover={{ transform: 'scale(1.05)', opacity: 0.9 }}
      >
        <ProductionLogo company={company} />
      </Box>
    </NextLink>
  );
}
