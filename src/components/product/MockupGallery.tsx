'use client'

import type { MockupScene } from '@/lib/mockup-scenes'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './MockupGallery.module.css'

interface MockupGalleryProps {
  scenes: MockupScene[]
  /** Ordered list of product image URLs (CachedProduct.images). May be empty. */
  productImages: string[]
  productName: string
}

export function MockupGallery({
  scenes,
  productImages,
  productName
}: MockupGalleryProps): JSX.Element {
  const [sceneIdx, setSceneIdx] = useState(0)
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

  const activeScene = scenes[sceneIdx]
  const activeImage = productImages[productImageIdx] ?? null

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'ArrowRight') {
      setSceneIdx((i) => (i + 1) % scenes.length)
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      setSceneIdx((i) => (i - 1 + scenes.length) % scenes.length)
      e.preventDefault()
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      role="group"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span id={titleId} style={{ position: 'absolute', left: -9999, top: 'auto' }}>
        Mockup gallery
      </span>

      <div className={styles.thumbStrip}>
        <p className={styles.groupLabel}>Scenes</p>
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={styles.thumb}
            aria-label={`Scene: ${s.name}`}
            aria-pressed={i === sceneIdx}
            onClick={() => setSceneIdx(i)}
          >
            <img src={s.backgroundImage} alt="" />
          </button>
        ))}

        {productImages.length > 1 && (
          <>
            <p className={styles.groupLabel}>Product images</p>
            {productImages.map((src, i) => (
              <button
                key={src}
                type="button"
                className={styles.thumb}
                aria-label={`Product image ${i + 1} of ${productImages.length}`}
                aria-pressed={i === productImageIdx}
                onClick={() => setProductImageIdx(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </>
        )}
      </div>

      <div
        className={styles.display}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        role="img"
        aria-label={
          activeImage ? `${productName} on ${activeScene.name}` : 'No product image available'
        }
      >
        {scenes.map((s, i) => (
          <img
            key={s.id}
            src={s.backgroundImage}
            alt=""
            className={styles.bg}
            data-active={i === sceneIdx}
          />
        ))}
        {activeImage && (
          <img
            src={activeImage}
            alt={productName}
            className={styles.overlay}
            style={{
              top: activeScene.productPosition.top,
              left: activeScene.productPosition.left,
              width: activeScene.productPosition.width,
              height: activeScene.productPosition.height,
              transform: activeScene.productPosition.transform
            }}
          />
        )}
      </div>
    </div>
  )
}
