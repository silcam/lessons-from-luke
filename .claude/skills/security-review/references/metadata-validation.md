# Request Metadata Validation

## Purpose

Validate HTTP request metadata (headers, content type, size) before processing request body to prevent resource exhaustion, type confusion, and malicious uploads.

## Critical Validation Points

### 1. Content-Type Validation

**ALWAYS validate Content-Type header** before parsing request body.

#### Why It Matters

- Prevents type confusion attacks (JSON parsed as XML, etc.)
- Ensures correct parser is used
- Prevents unexpected behavior from malformed content

#### Implementation

```typescript
/**
 * Validate Content-Type header matches expected type
 */
function validateContentType(request: Request, expected: string): Result<void, ValidationError> {
  const contentType = request.headers.get("Content-Type");

  if (!contentType) {
    return err(new ValidationError("Content-Type header is required"));
  }

  // Extract media type without charset
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  if (mediaType !== expected) {
    return err(new ValidationError(`Expected Content-Type ${expected}, got ${contentType}`));
  }

  return ok(undefined);
}

// Usage in handler
export async function handleCreateTask(request: Request): Promise<Response> {
  // Validate Content-Type before parsing body
  const contentTypeResult = validateContentType(request, "application/json");
  if (!contentTypeResult.success) {
    return jsonResponse(415, {
      error: "Unsupported media type",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  }

  // Safe to parse JSON
  const body = await request.json();
  // ...
}
```

#### Allowed Content Types

| Content Type                      | Use Case       | Parser                                    |
| --------------------------------- | -------------- | ----------------------------------------- |
| application/json                  | API requests   | request.json()                            |
| application/x-www-form-urlencoded | HTML forms     | new URLSearchParams(await request.text()) |
| multipart/form-data               | File uploads   | request.formData()                        |
| text/plain                        | Raw text input | request.text()                            |

**NEVER accept**:

- text/html (XSS risk)
- application/javascript (code injection)
- application/xml (XXE risk, unless specifically needed)

### 2. Content-Length Validation

**ALWAYS validate Content-Length** before reading request body to prevent resource exhaustion.

#### Why It Matters

- Prevents DoS via extremely large requests
- Prevents memory exhaustion
- Protects against decompression bombs
- Enforces storage limits for file uploads

#### Implementation

```typescript
/**
 * Validate Content-Length is within acceptable range
 */
function validateContentLength(
  request: Request,
  maxBytes: number
): Result<number, ValidationError> {
  const contentLength = request.headers.get("Content-Length");

  if (!contentLength) {
    return err(new ValidationError("Content-Length header is required"));
  }

  const length = parseInt(contentLength, 10);

  if (isNaN(length) || length < 0) {
    return err(new ValidationError("Invalid Content-Length value"));
  }

  if (length > maxBytes) {
    return err(
      new ValidationError(`Request body too large: ${length} bytes (max ${maxBytes} bytes)`)
    );
  }

  return ok(length);
}

// Usage in handler
export async function handleCreateTask(request: Request): Promise<Response> {
  // Validate size before reading body (10KB max for JSON)
  const lengthResult = validateContentLength(request, 10 * 1024);
  if (!lengthResult.success) {
    return jsonResponse(413, {
      error: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  const body = await request.json();
  // ...
}
```

#### Recommended Size Limits

| Request Type             | Max Size | Rationale                        |
| ------------------------ | -------- | -------------------------------- |
| JSON API requests        | 10 KB    | Sufficient for most API payloads |
| Form submissions         | 50 KB    | Accommodates large form data     |
| File uploads (images)    | 5 MB     | Standard image size              |
| File uploads (documents) | 10 MB    | Standard document size           |
| File uploads (videos)    | 100 MB   | Standard video size              |
| Streaming uploads        | Chunked  | Process in chunks, don't buffer  |

**CRITICAL**: Validate size **BEFORE** buffering entire request body into memory.

### 3. File Upload Validation

**ALWAYS validate file metadata** before processing uploaded files.

#### Why It Matters

- Prevents storage exhaustion
- Prevents malicious file uploads (executables, scripts)
- Enforces file type restrictions
- Protects against zip bombs and other decompression attacks

#### Implementation

```typescript
/**
 * File upload validation
 */
interface FileValidationConfig {
  allowedTypes: string[]; // MIME types
  maxSize: number; // Bytes
  allowedExtensions?: string[]; // Optional extension whitelist
}

/**
 * Validate uploaded file metadata
 */
async function validateFileUpload(
  file: File,
  config: FileValidationConfig
): Promise<Result<void, ValidationError>> {
  // Validate file size
  if (file.size > config.maxSize) {
    return err(
      new ValidationError(`File too large: ${file.size} bytes (max ${config.maxSize} bytes)`)
    );
  }

  // Validate MIME type
  if (!config.allowedTypes.includes(file.type)) {
    return err(
      new ValidationError(
        `File type not allowed: ${file.type}. Allowed types: ${config.allowedTypes.join(", ")}`
      )
    );
  }

  // Validate file extension (optional additional check)
  if (config.allowedExtensions) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !config.allowedExtensions.includes(extension)) {
      return err(
        new ValidationError(
          `File extension not allowed: ${extension}. Allowed: ${config.allowedExtensions.join(", ")}`
        )
      );
    }
  }

  // Validate file name (no directory traversal)
  if (file.name.includes("..") || file.name.includes("/") || file.name.includes("\\")) {
    return err(new ValidationError("Invalid file name"));
  }

  return ok(undefined);
}

// Usage in upload handler
export async function handleFileUpload(request: Request, env: Env): Promise<Response> {
  // Validate Content-Type for multipart
  const contentTypeResult = validateContentType(request, "multipart/form-data");
  if (!contentTypeResult.success) {
    return jsonResponse(415, { error: "Expected multipart/form-data" });
  }

  // Validate Content-Length before reading (5MB max)
  const lengthResult = validateContentLength(request, 5 * 1024 * 1024);
  if (!lengthResult.success) {
    return jsonResponse(413, { error: "File too large" });
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return jsonResponse(400, { error: "No file provided" });
  }

  // Validate file metadata
  const validationResult = await validateFileUpload(file, {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedExtensions: ["jpg", "jpeg", "png", "webp"],
  });

  if (!validationResult.success) {
    return jsonResponse(400, { error: validationResult.error.message });
  }

  // Process file upload
  const uploadResult = await uploadFileUseCase.execute({
    file: await file.arrayBuffer(),
    fileName: file.name,
    mimeType: file.type,
  });

  if (!uploadResult.success) {
    return errorResponse(uploadResult.error);
  }

  return jsonResponse(201, { fileId: uploadResult.value.id });
}
```

#### File Type Whitelists

**IMAGES**:

```typescript
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
```

**DOCUMENTS**:

```typescript
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "txt"];
```

**SPREADSHEETS**:

```typescript
const SPREADSHEET_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const SPREADSHEET_EXTENSIONS = ["xls", "xlsx", "csv"];
```

**NEVER allow**:

- Executables: .exe, .dll, .app, .dmg, .pkg
- Scripts: .js, .sh, .bat, .cmd, .ps1
- Archives without scanning: .zip, .tar, .gz (zip bombs)
- Web files: .html, .htm, .svg (XSS vectors)

### 4. Request Method Validation

**ALWAYS validate HTTP method** matches endpoint expectations.

```typescript
/**
 * Validate HTTP method
 */
function validateMethod(request: Request, allowed: string[]): Result<void, ValidationError> {
  if (!allowed.includes(request.method)) {
    return err(
      new ValidationError(`Method ${request.method} not allowed. Allowed: ${allowed.join(", ")}`)
    );
  }
  return ok(undefined);
}

// Usage
export async function handleCreateTask(request: Request): Promise<Response> {
  // Only allow POST
  const methodResult = validateMethod(request, ["POST"]);
  if (!methodResult.success) {
    return jsonResponse(405, {
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    });
  }
  // ...
}
```

## Validation Middleware Pattern

Combine all metadata validations into reusable middleware:

```typescript
/**
 * Request metadata validation configuration
 */
interface MetadataValidationConfig {
  allowedMethods: string[];
  requiredContentType?: string;
  maxContentLength?: number;
}

/**
 * Middleware to validate request metadata
 */
export function withMetadataValidation(
  config: MetadataValidationConfig,
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    // Validate method
    const methodResult = validateMethod(request, config.allowedMethods);
    if (!methodResult.success) {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    // Validate Content-Type (if required)
    if (config.requiredContentType) {
      const contentTypeResult = validateContentType(request, config.requiredContentType);
      if (!contentTypeResult.success) {
        return jsonResponse(415, { error: "Unsupported media type" });
      }
    }

    // Validate Content-Length (if max specified)
    if (config.maxContentLength) {
      const lengthResult = validateContentLength(request, config.maxContentLength);
      if (!lengthResult.success) {
        return jsonResponse(413, { error: "Request body too large" });
      }
    }

    // All validations passed, proceed
    return handler(request);
  };
}

// Usage
const createTaskHandler = withMetadataValidation(
  {
    allowedMethods: ["POST"],
    requiredContentType: "application/json",
    maxContentLength: 10 * 1024, // 10KB
  },
  async (request: Request) => {
    const body = await request.json();
    // ... handler logic
  }
);
```

## Testing Metadata Validation

### Test Content-Type Validation

```typescript
describe("validateContentType", () => {
  it("accepts correct content type", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = validateContentType(request, "application/json");
    expect(result.success).toBe(true);
  });

  it("accepts content type with charset", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    const result = validateContentType(request, "application/json");
    expect(result.success).toBe(true);
  });

  it("rejects missing content type", () => {
    const request = new Request("http://localhost", { method: "POST" });

    const result = validateContentType(request, "application/json");
    expect(result.success).toBe(false);
  });

  it("rejects wrong content type", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
    });

    const result = validateContentType(request, "application/json");
    expect(result.success).toBe(false);
  });
});
```

### Test Content-Length Validation

```typescript
describe("validateContentLength", () => {
  it("accepts valid content length", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Length": "1024" },
    });

    const result = validateContentLength(request, 10000);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(1024);
    }
  });

  it("rejects missing content length", () => {
    const request = new Request("http://localhost", { method: "POST" });

    const result = validateContentLength(request, 10000);
    expect(result.success).toBe(false);
  });

  it("rejects content length exceeding max", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Length": "20000" },
    });

    const result = validateContentLength(request, 10000);
    expect(result.success).toBe(false);
  });

  it("rejects invalid content length", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Length": "invalid" },
    });

    const result = validateContentLength(request, 10000);
    expect(result.success).toBe(false);
  });
});
```

### Test File Upload Validation

```typescript
describe("validateFileUpload", () => {
  it("accepts valid image file", async () => {
    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });

    const result = await validateFileUpload(file, {
      allowedTypes: ["image/jpeg", "image/png"],
      maxSize: 5 * 1024 * 1024,
      allowedExtensions: ["jpg", "jpeg", "png"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects file exceeding size limit", async () => {
    const largeContent = new Uint8Array(6 * 1024 * 1024); // 6MB
    const file = new File([largeContent], "large.jpg", { type: "image/jpeg" });

    const result = await validateFileUpload(file, {
      allowedTypes: ["image/jpeg"],
      maxSize: 5 * 1024 * 1024, // 5MB max
    });

    expect(result.success).toBe(false);
  });

  it("rejects disallowed file type", async () => {
    const file = new File(["content"], "test.exe", { type: "application/x-msdownload" });

    const result = await validateFileUpload(file, {
      allowedTypes: ["image/jpeg", "image/png"],
      maxSize: 5 * 1024 * 1024,
    });

    expect(result.success).toBe(false);
  });

  it("rejects directory traversal in filename", async () => {
    const file = new File(["content"], "../../../etc/passwd", { type: "text/plain" });

    const result = await validateFileUpload(file, {
      allowedTypes: ["text/plain"],
      maxSize: 1024,
    });

    expect(result.success).toBe(false);
  });
});
```

## Best Practices Checklist

- [ ] Validate Content-Type before parsing request body
- [ ] Validate Content-Length before reading request body
- [ ] Use strict MIME type whitelists (no wildcards)
- [ ] Validate file size before buffering
- [ ] Validate file extensions in addition to MIME type
- [ ] Reject directory traversal in file names
- [ ] Return 415 for unsupported Content-Type
- [ ] Return 413 for oversized requests
- [ ] Return 405 for disallowed HTTP methods
- [ ] Log metadata validation failures for monitoring

## Common Vulnerabilities

### ❌ Reading Body Without Size Check

```typescript
// ❌ WRONG - No size limit, vulnerable to DoS
export async function handleRequest(request: Request): Promise<Response> {
  const body = await request.json(); // Could be gigabytes!
  // ...
}
```

### ✅ Validate Size Before Reading

```typescript
// ✅ CORRECT - Size validated first
export async function handleRequest(request: Request): Promise<Response> {
  const lengthResult = validateContentLength(request, 10 * 1024);
  if (!lengthResult.success) {
    return jsonResponse(413, { error: "Request too large" });
  }

  const body = await request.json();
  // ...
}
```

### ❌ No Content-Type Validation

```typescript
// ❌ WRONG - Assumes JSON, could be anything
export async function handleRequest(request: Request): Promise<Response> {
  const body = await request.json(); // What if Content-Type is text/html?
  // ...
}
```

### ✅ Validate Content-Type First

```typescript
// ✅ CORRECT - Content-Type validated
export async function handleRequest(request: Request): Promise<Response> {
  const contentTypeResult = validateContentType(request, "application/json");
  if (!contentTypeResult.success) {
    return jsonResponse(415, { error: "Expected JSON" });
  }

  const body = await request.json();
  // ...
}
```

### ❌ File Upload Without Validation

```typescript
// ❌ WRONG - No file type or size validation
export async function handleUpload(request: Request): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  // Upload any file, any size, any type - DANGEROUS!
  await storage.put(file.name, await file.arrayBuffer());
  // ...
}
```

### ✅ Validate File Metadata

```typescript
// ✅ CORRECT - File validated before processing
export async function handleUpload(request: Request): Promise<Response> {
  const lengthResult = validateContentLength(request, 5 * 1024 * 1024);
  if (!lengthResult.success) {
    return jsonResponse(413, { error: "File too large" });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  const validationResult = await validateFileUpload(file, {
    allowedTypes: ["image/jpeg", "image/png"],
    maxSize: 5 * 1024 * 1024,
  });

  if (!validationResult.success) {
    return jsonResponse(400, { error: validationResult.error.message });
  }

  await storage.put(file.name, await file.arrayBuffer());
  // ...
}
```

## Related Skills

- **error-handling-patterns**: Result types, ValidationError usage
- **security-review**: Input validation, attack prevention
- **worker-request-handler**: Request parsing, middleware patterns
