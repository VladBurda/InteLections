export function sendJson(res, statusCode, payload, options = {}) {
  const { corsOrigin = '*', extraHeaders = {} } = options;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

export function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    ...extraHeaders,
  });
  res.end();
}

export function readBody(req, maxLength = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > maxLength) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function readRawBody(req, maxLength = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    req.on('data', chunk => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > maxLength) {
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

export function readMultipartForm(req, maxLength = 1_000_000) {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundaryToken = boundaryMatch?.[1] || boundaryMatch?.[2];

  if (!boundaryToken) {
    throw new Error('Expected multipart form data');
  }

  return readRawBody(req, maxLength).then(buffer => {
    const boundary = Buffer.from(`--${boundaryToken}`);
    const separator = Buffer.from('\r\n\r\n');
    const nextBoundaryMarker = Buffer.from(`\r\n--${boundaryToken}`);
    const fields = {};
    const files = {};

    let cursor = buffer.indexOf(boundary);
    if (cursor < 0) {
      throw new Error('Invalid multipart form data');
    }

    while (cursor >= 0) {
      cursor += boundary.length;

      if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) {
        break;
      }
      if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) {
        cursor += 2;
      }

      const headerEnd = buffer.indexOf(separator, cursor);
      if (headerEnd < 0) {
        break;
      }

      const headerLines = buffer.slice(cursor, headerEnd).toString('utf8').split('\r\n');
      const headers = {};
      for (const line of headerLines) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex < 0) continue;
        headers[line.slice(0, separatorIndex).trim().toLowerCase()] = line.slice(separatorIndex + 1).trim();
      }

      const disposition = String(headers['content-disposition'] || '');
      const nameMatch = disposition.match(/name="([^"]+)"/i);
      const fileNameMatch = disposition.match(/filename="([^"]*)"/i);
      const fieldName = nameMatch?.[1];
      if (!fieldName) {
        throw new Error('Multipart field name is missing');
      }

      const contentStart = headerEnd + separator.length;
      const nextBoundary = buffer.indexOf(nextBoundaryMarker, contentStart);
      if (nextBoundary < 0) {
        throw new Error('Invalid multipart form data');
      }

      const content = buffer.slice(contentStart, nextBoundary);
      if (fileNameMatch && fileNameMatch[1]) {
        files[fieldName] = {
          originalName: fileNameMatch[1],
          mimeType: String(headers['content-type'] || 'application/octet-stream'),
          buffer: content,
        };
      } else {
        fields[fieldName] = content.toString('utf8');
      }

      cursor = buffer.indexOf(boundary, nextBoundary + 2);
    }

    return { fields, files };
  });
}
