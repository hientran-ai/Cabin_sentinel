export type PrivacyBox = [number, number, number, number]

export function mapPrivacyBox(
  box: PrivacyBox,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  margin = 0.14,
) {
  const padX = (box[2] - box[0]) * margin
  const padY = (box[3] - box[1]) * margin
  const x1 = Math.max(0, box[0] - padX) * targetWidth / sourceWidth
  const y1 = Math.max(0, box[1] - padY) * targetHeight / sourceHeight
  const x2 = Math.min(sourceWidth, box[2] + padX) * targetWidth / sourceWidth
  const y2 = Math.min(sourceHeight, box[3] + padY) * targetHeight / sourceHeight
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Draw real obscured pixels over the webcam. Chromium may composite a live video separately, so an empty element
 * with CSS backdrop-filter can remain translucent without actually blurring the face underneath. */
export function paintPrivacyMasks(
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  video: HTMLVideoElement,
  boxes: PrivacyBox[],
  sourceWidth: number,
  sourceHeight: number,
) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return false
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) return false
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!boxes.length || sourceWidth <= 0 || sourceHeight <= 0) return true

  const small = scratch.getContext('2d')
  if (!small) return false
  for (const box of boxes) {
    const rect = mapPrivacyBox(box, sourceWidth, sourceHeight, canvas.width, canvas.height)
    const smallWidth = Math.max(8, Math.min(20, Math.round(rect.width / 12)))
    const smallHeight = Math.max(8, Math.min(20, Math.round(rect.height / 12)))
    scratch.width = smallWidth
    scratch.height = smallHeight
    small.clearRect(0, 0, smallWidth, smallHeight)
    small.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, smallWidth, smallHeight)

    context.save()
    context.beginPath()
    context.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2)
    context.clip()
    context.imageSmoothingEnabled = false
    context.filter = 'blur(6px)'
    context.drawImage(scratch, 0, 0, smallWidth, smallHeight, rect.x, rect.y, rect.width, rect.height)
    context.filter = 'none'
    context.restore()
  }
  return true
}
