import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /dsp/:patientId/documents — generate an exported summary
 * DocumentReference. All fields are optional; sensible PoC defaults are applied
 * in the service. Gated by the §6 "export record" right (Physician + Admin).
 */
export class CreateDocumentDto {
  /** Human-readable document title (attachment.title). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** DocumentReference.description. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Plain-text body of the exported summary (stored base64 in the attachment). */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  contentText?: string;
}
