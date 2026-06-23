'use client'

import type { MockupScene } from '@/lib/mockup-scenes'
import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './MockupGallery.module.css'

interface MockupGalleryProps {
  scenes: MockupScene[]
  /** Ordered list of product image URLs (CachedProduct.images). May be empty. */
  productImages: string[]
  productName: string
}

/**
 * Downres caps (Decision 2; theft protection). The print-resolution original is
 * never sent at full size: the displayed product overlay is bounded by the
 * `sizes` hint (~420px longest edge) at q70 and thumbnails to ~48px, so
 * `next/image` fetches a small srcset entry far below print resolution. Square
 * image URLs are remote-pattern-allowed in next.config. (NOTE: the original
 * Square URL is still exposed in the /_next/image `url=` param — a server-side
 * proxy is the real wall; tracked separately.)
 */
const THUMB_W = 48

/**
 * Clean "Artwork" view position (centered, large). The single product overlay
 * glides between this and each scene's authored position, so the art physically
 * moves into the room rather than fading or sliding.
 */
const CLEAN_POSITION = {
  top: '5%',
  left: '12%',
  width: '76%',
  height: '90%',
  transform: 'none'
} as const

/** Block right-click / drag image-save as a mild deterrent (Decision 2). */
function blockSave(e: React.SyntheticEvent): void {
  e.preventDefault()
}

export function MockupGallery({
  scenes,
  productImages,
  productName
}: MockupGalleryProps): JSX.Element {
  // -1 = clean "Artwork" view (the default primary view, Decision 3).
  // 0..n = a room scene.
  const [sceneIdx, setSceneIdx] = useState(-1)
  const [productImageIdx, setProductImageIdx] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const isArtwork = sceneIdx < 0
  const activeScene = isArtwork ? null : scenes[sceneIdx]
  const activeImage = productImages[productImageIdx] ?? null
  const activePosition = activeScene ? activeScene.productPosition : CLEAN_POSITION
  const aspectRatio = activeScene?.aspectRatio ?? 4 / 5

  // Subtle interactive tilt + sheen on the clean "Artwork" view. CSS-only (a 3D
  // transform + a gradient overlay), so it exposes no higher-res image (Decision
  // 2). Pointer moves write CSS vars on the overlay via ref — no React re-render
  // — and only take effect in the clean view with motion allowed.
  const overlayRef = useRef<HTMLDivElement>(null)
  const TILT_MAX = 7
  const resetTilt = (): void => {
    const el = overlayRef.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--sheen-o', '0')
  }
  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const el = overlayRef.current
    if (!el || !isArtwork || reducedMotion) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--tilt-x', `${(-(py - 0.5) * 2 * TILT_MAX).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${((px - 0.5) * 2 * TILT_MAX).toFixed(2)}deg`)
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    el.style.setProperty('--sheen-o', '1')
  }

  // Reset the tilt when leaving the clean view so it doesn't persist into scenes.
  useEffect(() => {
    const el = overlayRef.current
    if (isArtwork || !el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--sheen-o', '0')
  }, [isArtwork])

  // Arrow keys cycle the full ordered list: Artwork (-1) → scene 0 → … → last.
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'ArrowRight') {
      setSceneIdx((i) => (i + 1 > scenes.length - 1 ? -1 : i + 1))
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      setSceneIdx((i) => (i - 1 < -1 ? scenes.length - 1 : i - 1))
      e.preventDefault()
    }
  }

  const displayLabel = activeImage
    ? isArtwork
      ? `${productName} — artwork`
      : `${productName} on ${activeScene?.name}`
    : 'No product image available'

  return (
    <div
      ref={containerRef}
      className={styles.container}
      // biome-ignore lint/a11y/useSemanticElements: <fieldset> would impose form-control semantics this gallery doesn't have
      role="group"
      aria-labelledby={titleId}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: gallery container is keyboard-navigable via arrow keys (handled below)
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span id={titleId} style={{ position: 'absolute', left: -9999, top: 'auto' }}>
        Mockup gallery
      </span>

      <div className={styles.thumbStrip}>
        <p className={styles.groupLabel}>View</p>
        <button
          type="button"
          className={`${styles.thumb} ${styles.thumbArtwork}`}
          aria-label="Artwork (clean view)"
          aria-pressed={isArtwork}
          onClick={() => setSceneIdx(-1)}
        >
          {activeImage && (
            <Image
              src={activeImage}
              alt=""
              width={THUMB_W}
              height={THUMB_W}
              quality={60}
              draggable={false}
              onContextMenu={blockSave}
              onDragStart={blockSave}
            />
          )}
        </button>

        <p className={styles.groupLabel}>In a room</p>
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={styles.thumb}
            aria-label={`Scene: ${s.name}`}
            aria-pressed={i === sceneIdx}
            onClick={() => setSceneIdx(i)}
          >
            <img src={s.backgroundImage} alt="" draggable={false} />
          </button>
        ))}

        {productImages.length > 1 && (
          <>
            <p className={styles.groupLabel}>Product images</p>
            {productImages.map((src, i) => (
              <button
                key={src}
                type="button"
                className={`${styles.thumb} ${styles.thumbArtwork}`}
                aria-label={`Product image ${i + 1} of ${productImages.length}`}
                aria-pressed={i === productImageIdx}
                onClick={() => setProductImageIdx(i)}
              >
                <Image
                  src={src}
                  alt=""
                  width={THUMB_W}
                  height={THUMB_W}
                  quality={60}
                  draggable={false}
                  onContextMenu={blockSave}
                  onDragStart={blockSave}
                />
              </button>
            ))}
          </>
        )}
      </div>

      <div
        className={styles.display}
        style={{ aspectRatio: String(aspectRatio) }}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        data-view={isArtwork ? 'artwork' : 'scene'}
        role="img"
        aria-label={displayLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
      >
        {/* Scene backgrounds — stacked, crossfade by opacity. Clean "Artwork"
            view has none active, so the dark frame shows. */}
        {scenes.map((s, i) => (
          <img
            key={s.id}
            src={s.backgroundImage}
            alt=""
            className={styles.bg}
            data-active={!isArtwork && i === sceneIdx}
            draggable={false}
          />
        ))}

        {/* Single product overlay — GLIDES between the clean position and each
            scene's authored position via `transition: all` on .overlayWrap, so
            the art physically moves/reshapes into the room (matches the original
            prototype) rather than fading or sliding. */}
        {activeImage && (
          <div
            ref={overlayRef}
            className={styles.overlayWrap}
            style={{
              top: activePosition.top,
              left: activePosition.left,
              width: activePosition.width,
              height: activePosition.height,
              transform: activePosition.transform
            }}
          >
            {/* Inner tilt layer (clean-view pointer effect) — separate element so
                its fast follow doesn't inherit the 0.8s glide transition. */}
            <div className={styles.tilt}>
              <Image
                key={activeImage}
                src={activeImage}
                alt={productName}
                fill
                quality={70}
                sizes="(max-width: 640px) 60vw, 420px"
                priority
                draggable={false}
                onContextMenu={blockSave}
                onDragStart={blockSave}
              />
              {isArtwork && <div className={styles.sheen} aria-hidden="true" />}
            </div>
          </div>
        )}

        {/* Transparent shield blocks right-click / drag-save over the whole frame. */}
        <button
          type="button"
          className={styles.saveShield}
          aria-hidden="true"
          tabIndex={-1}
          onContextMenu={blockSave}
          onDragStart={blockSave}
          draggable={false}
        />
      </div>
    </div>
  )
}
