/**
 * Hardcoded mockup gallery scene library (Decision 3).
 *
 * Phase 5 ships exactly the 4 scenes from the legacy site at
 * docs/superpowers/specs/reference/mockup-gallery-original.html.
 * Background images self-hosted under public/images/mockup-scenes/.
 *
 * Future phases (likely Phase 7+) replace this const with admin-editable
 * data from site_settings + an /admin/settings scene editor.
 */

export interface MockupScene {
  id: string
  name: string
  /** Path under /public, served as a root-relative URL. */
  backgroundImage: string
  /**
   * Natural aspect ratio (width / height) of `backgroundImage`. The gallery
   * frame matches this so the background shows uncropped and each scene's
   * `productPosition` (authored as % of the frame) lands where intended.
   */
  aspectRatio: number
  productPosition: {
    top: string
    left: string
    width: string
    height: string
    transform: string
  }
}

export const MOCKUP_SCENES: readonly MockupScene[] = [
  {
    id: 'style1',
    name: 'Modern Gallery Wall',
    backgroundImage: '/images/mockup-scenes/style1.webp',
    aspectRatio: 1200 / 750,
    productPosition: {
      top: '5%',
      left: '30%',
      width: '37%',
      height: '90%',
      transform: 'perspective(400px) rotate3d(0, 0, 0, 0deg)'
    }
  },
  {
    id: 'style2',
    name: 'Angled Wall',
    backgroundImage: '/images/mockup-scenes/style2.webp',
    aspectRatio: 1200 / 750,
    productPosition: {
      top: '5%',
      left: '48%',
      width: '33%',
      height: '80%',
      transform: 'perspective(400px) rotate3d(0, -1, 0, -20deg)'
    }
  },
  {
    id: 'style3',
    name: 'Classic Display',
    backgroundImage: '/images/mockup-scenes/style3.webp',
    aspectRatio: 1024 / 1024,
    productPosition: {
      top: '3%',
      left: '40%',
      width: '20%',
      height: '30%',
      transform: 'rotate(0deg)'
    }
  },
  {
    id: 'style4',
    name: 'Premium Showcase',
    backgroundImage: '/images/mockup-scenes/style4.webp',
    aspectRatio: 1024 / 1028,
    productPosition: {
      top: '5%',
      left: '43%',
      width: '20%',
      height: '30%',
      transform: 'rotate(0deg)'
    }
  }
] as const
