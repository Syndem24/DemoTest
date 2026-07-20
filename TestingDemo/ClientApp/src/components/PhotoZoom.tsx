import { useEffect, useState } from 'react'

type PhotoZoomProps = {
  images: string[]
  startIndex?: number
  open: boolean
  alt?: string
  onClose: () => void
}

export function PhotoZoom({
  images,
  startIndex = 0,
  open,
  alt = '',
  onClose,
}: PhotoZoomProps) {
  const [index, setIndex] = useState(startIndex)
  const sources = images.filter(Boolean)

  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(startIndex, 0), Math.max(sources.length - 1, 0)))
    }
  }, [open, startIndex, sources.length])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft' && sources.length > 1) {
        setIndex((value) => (value - 1 + sources.length) % sources.length)
      } else if (event.key === 'ArrowRight' && sources.length > 1) {
        setIndex((value) => (value + 1) % sources.length)
      }
    }

    document.body.classList.add('rm-photo-zoom-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('rm-photo-zoom-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, sources.length])

  if (!open || sources.length === 0) {
    return null
  }

  const src = sources[index] ?? sources[0]
  const multi = sources.length > 1

  return (
    <div className="rm-photo-zoom" role="dialog" aria-modal="true" aria-label="Photo zoom">
      <button type="button" className="rm-photo-zoom-backdrop" aria-label="Close" onClick={onClose} />
      <div className="rm-photo-zoom-dialog">
        <button type="button" className="rm-photo-zoom-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        {multi ? (
          <button
            type="button"
            className="rm-photo-zoom-nav is-prev"
            aria-label="Previous photo"
            onClick={() => setIndex((value) => (value - 1 + sources.length) % sources.length)}
          >
            ‹
          </button>
        ) : null}
        <img className="rm-photo-zoom-image" src={src} alt={alt} />
        {multi ? (
          <button
            type="button"
            className="rm-photo-zoom-nav is-next"
            aria-label="Next photo"
            onClick={() => setIndex((value) => (value + 1) % sources.length)}
          >
            ›
          </button>
        ) : null}
        <div className="rm-photo-zoom-meta">
          <span className="rm-photo-zoom-caption">{alt}</span>
          <span className="rm-photo-zoom-counter">
            {multi ? `${index + 1} / ${sources.length}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

type ZoomableImageProps = {
  src: string
  alt: string
  images?: string[]
  className?: string
  loading?: 'lazy' | 'eager'
}

export function ZoomableImage({
  src,
  alt,
  images,
  className,
  loading = 'lazy',
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false)
  const gallery = (images?.length ? images : [src]).filter(Boolean)
  const startIndex = Math.max(0, gallery.indexOf(src))

  return (
    <>
      <button
        type="button"
        className={`rm-zoomable-trigger ${className ?? ''}`.trim()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
        title="Click to zoom"
        aria-label={`Zoom ${alt}`}
      >
        <img src={src} alt={alt} loading={loading} />
      </button>
      <PhotoZoom
        open={open}
        images={gallery}
        startIndex={startIndex}
        alt={alt}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
