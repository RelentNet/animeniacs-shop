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
 * Downres caps (Decision 2; halved 2026-06-17 for stronger theft protection).
 * The print-resolution original is never sent at full size: the clean "Artwork"
 * view is bounded to ~550px on its longest edge at q70 (the box upscales it, so
 * it reads soft but is far below print resolution), thumbnails to ~48px. The
 * `sizes` hints below are likewise halved so the browser fetches the smaller
 * srcset entry. Square image URLs are remote-pattern-allowed in next.config, so
 * `next/image` optimizes + downscales them. (NOTE: the original Square URL is
 * still exposed in the /_next/image `url=` param — a server-side proxy is the
 * real wall; tracked separately.)
 */
const DISPLAY_W = 550
const DISPLAY_H = 688 // 4/5 frame
const THUMB_W = 48

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
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        data-view={isArtwork ? 'artwork' : 'scene'}
        role="img"
        aria-label={displayLabel}
      >
        {/* Room-scene backgrounds — all mounted, crossfade by opacity. */}
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

        {/* Clean "Artwork" layer — stays mounted so it crossfades in/out
            instead of popping. Keyed by image so switching product images
            replays a gentle fade-in. */}
        {activeImage && (
          <div className={styles.artwork} data-active={isArtwork}>
            <Image
              key={activeImage}
              src={activeImage}
              alt={productName}
              width={DISPLAY_W}
              height={DISPLAY_H}
              quality={70}
              sizes="(max-width: 640px) 45vw, 290px"
              priority
              draggable={false}
              onContextMenu={blockSave}
              onDragStart={blockSave}
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
            />
          </div>
        )}

        {/* Per-scene product overlays — one per scene in its own position, each
            crossfading by opacity so scene↔scene fades cleanly (never slides). */}
        {activeImage &&
          scenes.map((s, i) => (
            <div
              key={s.id}
              className={styles.overlayWrap}
              data-active={!isArtwork && i === sceneIdx}
              style={{
                top: s.productPosition.top,
                left: s.productPosition.left,
                width: s.productPosition.width,
                height: s.productPosition.height,
                transform: s.productPosition.transform
              }}
            >
              <Image
                src={activeImage}
                alt=""
                fill
                quality={70}
                sizes="(max-width: 640px) 30vw, 160px"
                draggable={false}
                onContextMenu={blockSave}
                onDragStart={blockSave}
              />
            </div>
          ))}

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
