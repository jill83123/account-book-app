import type { Directive } from 'vue'

type Cleanup = () => void
const cleanups = new WeakMap<HTMLElement, Cleanup>()

/**
 * A row that scrolls sideways without a scrollbar: the mouse wheel moves it left and right,
 * and it can be dragged with the mouse. Fingers on a touch screen scroll it natively.
 */
export const vDragScroll: Directive<HTMLElement> = {
  mounted(el) {
    let startX = 0
    let startLeft = 0
    let down = false
    let moved = false

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY))
      if (next === el.scrollLeft) return
      e.preventDefault()
      el.scrollLeft = next
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) < 4) return
      moved = true
      el.scrollLeft = startLeft - dx
    }
    const onUp = () => (down = false)
    // the click that ends a drag must not press the button under the pointer
    const onClick = (e: MouseEvent) => {
      if (!moved) return
      e.stopPropagation()
      e.preventDefault()
      moved = false
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('click', onClick, true)
    cleanups.set(el, () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('click', onClick, true)
    })
  },
  unmounted(el) {
    cleanups.get(el)?.()
    cleanups.delete(el)
  },
}
