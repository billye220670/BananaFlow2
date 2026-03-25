export enum ValidationError {
  InvalidType = "仅支持 JPG/PNG/WebP 格式",
  TooLarge = "文件大小不能超过 10MB",
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_SIZE_BYTES = 10 * 1024 * 1024

export function validateFile(file: File): ValidationError | null {
  if (!ALLOWED_TYPES.has(file.type)) return ValidationError.InvalidType
  if (file.size > MAX_SIZE_BYTES) return ValidationError.TooLarge
  return null
}
