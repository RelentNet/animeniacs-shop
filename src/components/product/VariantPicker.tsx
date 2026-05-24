'use client'

import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { useEffect, useId, useRef, useState } from 'react'

interface VariantPickerProps {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  onChange: (variation: CachedVariation | null) => void
  initialVariationId?: string
}

function findVariation(
  variations: CachedVariation[],
  itemOptions: CachedItemOption[],
  selected: Map<string, string>
): CachedVariation | null {
  return (
    variations.find((v) =>
      itemOptions.every((opt) => {
        const pickedValue = selected.get(opt.id)
        return pickedValue !== undefined && v.optionValueIds.includes(pickedValue)
      })
    ) ?? null
  )
}

export function VariantPicker({
  variations,
  itemOptions,
  onChange,
  initialVariationId
}: VariantPickerProps): JSX.Element | null {
  // Zero variations: nothing meaningful to render.
  if (variations.length === 0) return null
  // Zero options + one variation: picker is invisible.
  if (itemOptions.length === 0 && variations.length === 1) return null

  // The "zero options + multiple variations" branch renders a single
  // <select> over variation names.
  if (itemOptions.length === 0) {
    return (
      <VariationNameSelect
        variations={variations}
        onChange={onChange}
        initialVariationId={initialVariationId}
      />
    )
  }

  return (
    <OptionSelects
      variations={variations}
      itemOptions={itemOptions}
      onChange={onChange}
      initialVariationId={initialVariationId}
    />
  )
}

function VariationNameSelect({
  variations,
  onChange,
  initialVariationId
}: {
  variations: CachedVariation[]
  onChange: (v: CachedVariation | null) => void
  initialVariationId?: string
}): JSX.Element {
  const id = useId()
  const initial =
    (initialVariationId && variations.find((v) => v.id === initialVariationId)) ?? variations[0]
  const [selectedId, setSelectedId] = useState(initial.id)
  const fired = useRef(false)

  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      onChange(initial)
    }
  }, [initial, onChange])

  return (
    <div>
      <label htmlFor={id}>Variation</label>
      <select
        id={id}
        value={selectedId}
        onChange={(e) => {
          setSelectedId(e.target.value)
          const v = variations.find((v) => v.id === e.target.value) ?? null
          onChange(v)
        }}
      >
        {variations.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function OptionSelects({
  variations,
  itemOptions,
  onChange,
  initialVariationId
}: VariantPickerProps): JSX.Element {
  const initialVariation =
    (initialVariationId && variations.find((v) => v.id === initialVariationId)) ?? variations[0]
  const initialSelected = new Map<string, string>()
  for (const opt of itemOptions) {
    const pickedValueId = initialVariation.optionValueIds.find((vid) =>
      opt.values.some((val) => val.id === vid)
    )
    if (pickedValueId) initialSelected.set(opt.id, pickedValueId)
  }

  const [selected, setSelected] = useState<Map<string, string>>(initialSelected)
  const fired = useRef(false)

  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      onChange(findVariation(variations, itemOptions, selected))
    }
  }, [variations, itemOptions, selected, onChange])

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {itemOptions.map((opt) => {
        const id = `option-${opt.id}`
        return (
          <div key={opt.id}>
            <label htmlFor={id}>{opt.name}</label>
            <select
              id={id}
              name={`option-${opt.id}`}
              value={selected.get(opt.id) ?? ''}
              onChange={(e) => {
                const next = new Map(selected)
                next.set(opt.id, e.target.value)
                setSelected(next)
                onChange(findVariation(variations, itemOptions, next))
              }}
            >
              {opt.values.map((val) => (
                <option key={val.id} value={val.id}>
                  {val.name}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
