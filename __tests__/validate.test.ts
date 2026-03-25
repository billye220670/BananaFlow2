import { describe, it, expect } from "vitest"
import { validateFile, ValidationError } from "@/lib/validate"

const makeFile = (name: string, type: string, sizeBytes: number): File =>
  new File(["x".repeat(sizeBytes)], name, { type })

describe("validateFile", () => {
  it("accepts valid JPG under 10MB", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024 * 1024)
    expect(validateFile(file)).toBeNull()
  })

  it("accepts valid PNG", () => {
    const file = makeFile("art.png", "image/png", 500)
    expect(validateFile(file)).toBeNull()
  })

  it("accepts valid WebP", () => {
    const file = makeFile("img.webp", "image/webp", 500)
    expect(validateFile(file)).toBeNull()
  })

  it("rejects unsupported file type", () => {
    const file = makeFile("doc.pdf", "application/pdf", 500)
    expect(validateFile(file)).toBe(ValidationError.InvalidType)
  })

  it("rejects file over 10MB", () => {
    const file = makeFile("big.png", "image/png", 11 * 1024 * 1024)
    expect(validateFile(file)).toBe(ValidationError.TooLarge)
  })

  it("rejects exactly at 10MB boundary (exclusive)", () => {
    const file = makeFile("exact.png", "image/png", 10 * 1024 * 1024 + 1)
    expect(validateFile(file)).toBe(ValidationError.TooLarge)
  })

  it("accepts exactly 10MB (inclusive)", () => {
    const file = makeFile("exact.png", "image/png", 10 * 1024 * 1024)
    expect(validateFile(file)).toBeNull()
  })
})
