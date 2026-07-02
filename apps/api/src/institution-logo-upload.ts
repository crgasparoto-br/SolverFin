import { createHash, createHmac } from "node:crypto";

import { financialInstitutionCatalog, type FinancialInstitutionKey } from "@solverfin/domain";

export const INSTITUTION_LOGO_MAX_BYTES_ENV_KEY = "INSTITUTION_LOGO_MAX_BYTES";
export const DEFAULT_INSTITUTION_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_LOGO_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export interface InstitutionLogoUploadInput {
  institutionKey: string;
  fileName?: string;
  mimeType: string;
  contentBase64: string;
}

export interface ValidatedInstitutionLogoUpload {
  institutionKey: FinancialInstitutionKey;
  mimeType: string;
  extension: string;
  content: Buffer;
  contentSha256: string;
  objectKey: string;
}

export interface UploadedInstitutionLogo {
  institutionKey: FinancialInstitutionKey;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  contentSha256: string;
  uploadedAt: string;
}

export interface LogoStorageAdapter {
  putObject(input: {
    objectKey: string;
    content: Buffer;
    mimeType: string;
  }): Promise<{ objectKey: string; publicUrl: string }>;
}

export class InstitutionLogoUploadError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "InstitutionLogoUploadError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const uploadedInstitutionLogos = new Map<string, UploadedInstitutionLogo>();

export function getUploadedInstitutionLogo(
  institutionKey: string,
): UploadedInstitutionLogo | undefined {
  return uploadedInstitutionLogos.get(institutionKey);
}

export function clearUploadedInstitutionLogosForTests(): void {
  uploadedInstitutionLogos.clear();
}

export async function uploadInstitutionLogo(
  input: InstitutionLogoUploadInput,
  adapter: LogoStorageAdapter = createR2LogoStorageAdapter(),
): Promise<UploadedInstitutionLogo> {
  const validated = validateInstitutionLogoUpload(input);
  const stored = await adapter.putObject({
    objectKey: validated.objectKey,
    content: validated.content,
    mimeType: validated.mimeType,
  });
  const uploadedAt = new Date().toISOString();
  const logo: UploadedInstitutionLogo = {
    institutionKey: validated.institutionKey,
    objectKey: stored.objectKey,
    publicUrl: stored.publicUrl,
    mimeType: validated.mimeType,
    sizeBytes: validated.content.byteLength,
    contentSha256: validated.contentSha256,
    uploadedAt,
  };

  uploadedInstitutionLogos.set(validated.institutionKey, logo);

  return logo;
}

export function validateInstitutionLogoUpload(
  input: InstitutionLogoUploadInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ValidatedInstitutionLogoUpload {
  const institution = financialInstitutionCatalog.find((item) => item.key === input.institutionKey);

  if (!institution) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_UNKNOWN_INSTITUTION",
      "Instituição financeira não encontrada no catálogo global.",
      404,
    );
  }

  if (institution.status !== "active") {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_INACTIVE_INSTITUTION",
      "Instituição financeira inativa não pode receber logomarca.",
      400,
    );
  }

  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const extension = ALLOWED_LOGO_TYPES.get(normalizedMimeType);

  if (!extension) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_UNSUPPORTED_TYPE",
      "Formato inválido. Envie PNG, JPG/JPEG ou WebP.",
      400,
    );
  }

  const content = decodeBase64(input.contentBase64);

  if (content.byteLength === 0) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_EMPTY_FILE",
      "Arquivo vazio. Envie uma logomarca válida.",
      400,
    );
  }

  const maxBytes = resolveMaxLogoBytes(env);

  if (content.byteLength > maxBytes) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_FILE_TOO_LARGE",
      `Arquivo muito grande. O limite atual é ${formatBytes(maxBytes)}.`,
      413,
    );
  }

  assertMagicBytes(content, normalizedMimeType);

  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const objectKey = buildInstitutionLogoObjectKey({
    institutionKey: institution.key,
    extension,
    contentSha256,
  });

  return {
    institutionKey: institution.key,
    mimeType: normalizedMimeType,
    extension,
    content,
    contentSha256,
    objectKey,
  };
}

export function buildInstitutionLogoObjectKey(input: {
  institutionKey: FinancialInstitutionKey;
  extension: string;
  contentSha256: string;
}): string {
  const hashPrefix = input.contentSha256.slice(0, 16);

  return `institutions/${input.institutionKey}/logo-${hashPrefix}.${input.extension}`;
}

export function createR2LogoStorageAdapter(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LogoStorageAdapter {
  const config = resolveR2Config(env);

  return {
    async putObject(input) {
      const url = buildR2ObjectUrl(config, input.objectKey);
      const headers = signR2PutObject({
        config,
        url,
        content: input.content,
        mimeType: input.mimeType,
      });
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: input.content,
      });

      if (!response.ok) {
        throw new InstitutionLogoUploadError(
          "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
          "Não foi possível salvar a logomarca no storage R2.",
          502,
        );
      }

      return {
        objectKey: input.objectKey,
        publicUrl: `${config.publicBaseUrl}/${input.objectKey}`,
      };
    },
  };
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
  region: string;
}

function resolveR2Config(env: Readonly<Record<string, string | undefined>>): R2Config {
  const config = {
    accountId: readRequiredEnv(env, "R2_ACCOUNT_ID"),
    accessKeyId: readRequiredEnv(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv(env, "R2_SECRET_ACCESS_KEY"),
    bucketName: readRequiredEnv(env, "R2_BUCKET_NAME"),
    publicBaseUrl: readRequiredEnv(env, "R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    region: env.R2_REGION?.trim() || "auto",
  };

  return config;
}

function readRequiredEnv(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_STORAGE_NOT_CONFIGURED",
      "Storage R2 não configurado para upload de logomarcas.",
      503,
    );
  }

  return value;
}

function buildR2ObjectUrl(config: R2Config, objectKey: string): URL {
  return new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${encodePathSegment(config.bucketName)}/${encodeObjectKey(objectKey)}`,
  );
}

function signR2PutObject(input: {
  config: R2Config;
  url: URL;
  content: Buffer;
  mimeType: string;
}): Headers {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const contentHash = createHash("sha256").update(input.content).digest("hex");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${input.mimeType}`,
    `host:${input.url.host}`,
    `x-amz-content-sha256:${contentHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    input.url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const signingKey = getSignatureKey(
    input.config.secretAccessKey,
    dateStamp,
    input.config.region,
    "s3",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return new Headers({
    authorization,
    "content-type": input.mimeType,
    "x-amz-content-sha256": contentHash,
    "x-amz-date": amzDate,
  });
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Buffer {
  const dateKey = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const dateRegionKey = createHmac("sha256", dateKey).update(regionName).digest();
  const dateRegionServiceKey = createHmac("sha256", dateRegionKey).update(serviceName).digest();

  return createHmac("sha256", dateRegionServiceKey).update("aws4_request").digest();
}

function decodeBase64(value: string): Buffer {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;

  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_INVALID_CONTENT",
      "Conteúdo da imagem inválido.",
      400,
    );
  }

  return Buffer.from(normalized, "base64");
}

function assertMagicBytes(content: Buffer, mimeType: string): void {
  const isPng = content.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isWebp =
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP";

  if (
    (mimeType === "image/png" && isPng) ||
    (mimeType === "image/jpeg" && isJpeg) ||
    (mimeType === "image/webp" && isWebp)
  ) {
    return;
  }

  throw new InstitutionLogoUploadError(
    "INSTITUTION_LOGO_CONTENT_MISMATCH",
    "O conteúdo do arquivo não corresponde ao formato informado.",
    400,
  );
}

function resolveMaxLogoBytes(env: Readonly<Record<string, string | undefined>>): number {
  const value = Number(env[INSTITUTION_LOGO_MAX_BYTES_ENV_KEY] ?? DEFAULT_INSTITUTION_LOGO_MAX_BYTES);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INSTITUTION_LOGO_MAX_BYTES;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.floor(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${Math.floor(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(encodePathSegment).join("/");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}
