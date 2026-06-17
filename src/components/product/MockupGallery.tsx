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
 * Downres caps (Decision 2). The print-resolution original is never sent at
 * full size: the clean "Artwork" view is bounded to ~1100px on its longest
 * edge at q70, scene overlays to ~900px, thumbnails to ~96px. Square image
 * URLs are remote-pattern-allowed in next.config, so `next/image` optimizes
 * and downscales them.
 */
const DISPLAY_W = 1100
const DISPLAY_H = 1375 // 4/5 frame
const THUMB_W = 96

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
        {/* Room scenes: only mounted/visible when a scene is active. */}
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

        {activeImage && isArtwork && (
          <div className={styles.artwork}>
            <Image
              src={activeImage}
              alt={productName}
              width={DISPLAY_W}
              height={DISPLAY_H}
              quality={70}
              sizes="(max-width: 640px) 90vw, 580px"
              priority
              draggable={false}
              onContextMenu={blockSave}
              onDragStart={blockSave}
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
            />
          </div>
        )}

        {activeImage && !isArtwork && activeScene && (
          <div
            className={styles.overlayWrap}
            style={{
              top: activeScene.productPosition.top,
              left: activeScene.productPosition.left,
              width: activeScene.productPosition.width,
              height: activeScene.productPosition.height,
              transform: activeScene.productPosition.transform
            }}
          >
            <Image
              src={activeImage}
              alt={productName}
              fill
              quality={70}
              sizes="(max-width: 640px) 60vw, 320px"
              draggable={false}
              onContextMenu={blockSave}
              onDragStart={blockSave}
            />
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
