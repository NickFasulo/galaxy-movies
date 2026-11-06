import { useEffect } from 'react'

// iOS keeps the keyboard up while a field is focused, and scrolling with a live
// text field misbehaves (WebKit #174625-class gesture capture / caret-reveal
// scroll fights). Scroll = dismiss keyboard is the platform convention. Uses
// touchmove rather than scroll: iOS also fires scroll events when it pans the
// viewport to reveal a field on focus, which would self-blur every tap.
export const useDismissKeyboardOnScroll = () => {
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const el = document.activeElement
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      // The touch target is where the drag began — drags starting inside the
      // field are caret/text gestures, not page scrolls.
      if (e.target instanceof Node && el.contains(e.target)) return
      el.blur()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])
}
