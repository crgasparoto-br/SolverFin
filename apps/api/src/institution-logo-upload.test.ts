import assert from "node:assert/strict";

import {
  clearUploadedInstitutionLogosForTests,
  getUploadedInstitutionLogo,
  uploadInstitutionLogo,
  validateInstitutionLogoUpload,
  type LogoStorageAdapter,
} from "./institution-logo-upload.js";

const validPngBase64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]).toString("base64");

await validLogoUploadIsStoredWithSafeObjectKey();
unknownInstitutionIsRejected();
emptyLogoIsRejected();
unsupportedMimeTypeIsRejected();
contentMismatchIsRejected();
largeLogoIsRejectedBeforeStorage();
await storageFailureDoesNotUpdateLogoMetadata();

async function validLogoUploadIsStoredWithSafeObjectKey(): Promise<void> {
  clearUploadedInstitutionLogosForTests();
  const adapter = createMemoryAdapter();
  const uploaded = await uploadInstitutionLogo(
    {
      institutionKey: "bradesco",
      fileName: "../../bradesco original.png",
      mimeType: "image/png",
      contentBase64: validPngBase64,
    },
    adapter,
  );

  assert.equal(uploaded.institutionKey, "bradesco");
  assert.match(uploaded.objectKey, /^institutions\/bradesco\/logo-[a-f0-9]{16}\.png$/);
  assert.doesNotMatch(uploaded.objectKey, /original|\.\./);
  assert.equal(uploaded.publicUrl, `https://cdn.example.invalid/${uploaded.objectKey}`);
  assert.equal(getUploadedInstitutionLogo("bradesco")?.objectKey, uploaded.objectKey);
}

function unknownInstitutionIsRejected(): void {
  assertLogoError(
    () =>
      validateInstitutionLogoUpload({
        institutionKey: "banco_inexistente",
        mimeType: "image/png",
        contentBase64: validPngBase64,
      }),
    "INSTITUTION_LOGO_UNKNOWN_INSTITUTION",
  );
}

function emptyLogoIsRejected(): void {
  assertLogoError(
    () =>
      validateInstitutionLogoUpload({
        institutionKey: "bradesco",
        mimeType: "image/png",
        contentBase64: "",
      }),
    "INSTITUTION_LOGO_INVALID_CONTENT",
  );
}

function unsupportedMimeTypeIsRejected(): void {
  assertLogoError(
    () =>
      validateInstitutionLogoUpload({
        institutionKey: "bradesco",
        mimeType: "image/svg+xml",
        contentBase64: validPngBase64,
      }),
    "INSTITUTION_LOGO_UNSUPPORTED_TYPE",
  );
}

function contentMismatchIsRejected(): void {
  const jpegContent = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");

  assertLogoError(
    () =>
      validateInstitutionLogoUpload({
        institutionKey: "bradesco",
        mimeType: "image/png",
        contentBase64: jpegContent,
      }),
    "INSTITUTION_LOGO_CONTENT_MISMATCH",
  );
}

function largeLogoIsRejectedBeforeStorage(): void {
  const oversized = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...Array.from({ length: 12 }, () => 0x00),
  ]).toString("base64");

  assertLogoError(
    () =>
      validateInstitutionLogoUpload(
        {
          institutionKey: "bradesco",
          mimeType: "image/png",
          contentBase64: oversized,
        },
        { INSTITUTION_LOGO_MAX_BYTES: "10" },
      ),
    "INSTITUTION_LOGO_FILE_TOO_LARGE",
  );
}

async function storageFailureDoesNotUpdateLogoMetadata(): Promise<void> {
  clearUploadedInstitutionLogosForTests();
  const adapter: LogoStorageAdapter = {
    async putObject() {
      throw Object.assign(new Error("R2 offline"), {
        code: "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
        statusCode: 502,
      });
    },
  };

  await assertAsyncLogoError(
    () =>
      uploadInstitutionLogo(
        {
          institutionKey: "inter",
          mimeType: "image/png",
          contentBase64: validPngBase64,
        },
        adapter,
      ),
    "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
  );
  assert.equal(getUploadedInstitutionLogo("inter"), undefined);
}

function createMemoryAdapter(): LogoStorageAdapter {
  return {
    async putObject(input) {
      return {
        objectKey: input.objectKey,
        publicUrl: `https://cdn.example.invalid/${input.objectKey}`,
      };
    },
  };
}

function assertLogoError(action: () => void, expectedCode: string): void {
  try {
    action();
  } catch (error) {
    assert.equal((error as { code?: string }).code, expectedCode);
    return;
  }

  throw new Error(`Expected logo upload error ${expectedCode}.`);
}

async function assertAsyncLogoError(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert.equal((error as { code?: string }).code, expectedCode);
    return;
  }

  throw new Error(`Expected logo upload error ${expectedCode}.`);
}
