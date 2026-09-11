/**
 * Pure e-wallet receipt OCR text parsers (no DOM).
 * Loaded before admin-bookings.js.
 */
(() => {
  function cleanOcrParty(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/^[:\-–—.|]+/, '')
      .replace(/\b(SENT VIA|VIA GCASH|VIA MAYA|SUCCESS(?:FUL)?|EXPRESS SEND|TRANSACTION DETAILS)\b/gi, '')
      .replace(/\bto\b$/i, '')
      .replace(/^from\b/i, '')
      .trim()
      .slice(0, 160);
  }

  function parseMoneyToken(token) {
    if (!token) return null;
    const normalized = String(token).replace(/,/g, '').replace(/[^\d.]/g, '');
    const amount = Number(normalized);
    if (!(amount > 0) || !Number.isFinite(amount)) return null;
    if (amount > 5_000_000) return null;
    return Math.round(amount * 100) / 100;
  }

  function normalizePhMobile(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (/^09\d{9}$/.test(digits)) return digits;
    if (/^9\d{9}$/.test(digits)) return '0' + digits;
    if (/^639\d{9}$/.test(digits)) return '0' + digits.slice(2);
    if (/^63\d{10}$/.test(digits) && digits[2] === '9') return '0' + digits.slice(2);
    return '';
  }

  function formatPhMobileDisplay(rawValue) {
    const normalized = normalizePhMobile(rawValue);
    if (normalized) return normalized;
    return String(rawValue || '').replace(/\s+/g, ' ').trim();
  }

  function extractPhoneCandidates(text) {
    const matches = String(text || '').match(
      /(?:\+?\s*63\s*)?0?9(?:[\s\-]?\d){9}/g
    ) || [];
    const seen = new Set();
    const result = [];
    matches.forEach((match) => {
      const display = formatPhMobileDisplay(match);
      const key = normalizePhMobile(match) || display;
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(display);
    });
    return result;
  }

  function isDateNoiseToken(token) {
    const cleaned = String(token || '').replace(/[^A-Za-z0-9:]/g, '');
    return /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|AM|PM|MON|TUE|WED|THU|FRI|SAT|SUN|\d{1,2}:\d{2})$/i.test(
      cleaned
    );
  }

  function isYearToken(token) {
    return /^(19|20)\d{2}$/.test(String(token || '').replace(/\D/g, ''));
  }

  function isDayOrMonthNumberToken(token) {
    const digits = String(token || '').replace(/\D/g, '');
    if (!/^\d{1,2}$/.test(digits)) return false;
    const value = Number(digits);
    return value >= 1 && value <= 31;
  }

  function isUsableRefDigitChunk(chunk, joinedSoFar) {
    const digits = String(chunk || '').replace(/\D/g, '');
    if (!digits) return false;
    if (isYearToken(digits)) return false;
    // After the common GCash 4+3 prefix, ignore day numbers (01-31) from the date line.
    if (joinedSoFar.length >= 7 && isDayOrMonthNumberToken(digits)) return false;
    // Prefer the trailing 6-digit Ref segment; skip tiny leftovers.
    if (joinedSoFar.length >= 7 && digits.length < 4) return false;
    return true;
  }

  function extractClassicGcashRef(text) {
    // Express Send layout: "3035 300 966946" (4 + 3 + 6), sometimes split across lines.
    const compactNearby = String(text || '').replace(/[^\d\s]/g, ' ');
    const sameLine = compactNearby.match(/\b(\d{4})\s+(\d{3})\s+(\d{6})\b/);
    if (sameLine) return `${sameLine[1]}${sameLine[2]}${sameLine[3]}`;

    const loose = compactNearby.match(/\b(\d{4})\s+(\d{3})\s+(\d{5,7})\b/);
    if (loose) {
      const joined = `${loose[1]}${loose[2]}${loose[3]}`;
      if (joined.length >= 13) return joined.slice(0, 13);
    }

    // Split lines: 3035 300 \n 966946
    const acrossLines = String(text || '').match(
      /\b(\d{4})\s+(\d{3})\s*(?:\n+\s*|\s+)(\d{6})\b/
    );
    if (acrossLines) return `${acrossLines[1]}${acrossLines[2]}${acrossLines[3]}`;

    return '';
  }

  function looksLikeRefMergedWithDate(reference) {
    const digits = String(reference || '').replace(/\D/g, '');
    // e.g. 3035300 + 02 + 2025 => 3035300022025
    return /^\d{7}(0?[1-9]|[12]\d|3[01])(19|20)\d{2}$/.test(digits);
  }

  function collectGcashReferenceAfterLabel(lines) {
    const labelIndex = lines.findIndex((line) =>
      /(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?|REFERENCE NUMBER)\b/i.test(line)
    );
    if (labelIndex < 0) return '';

    const nearbyText = lines
      .slice(labelIndex, Math.min(lines.length, labelIndex + 5))
      .join('\n');
    const classic = extractClassicGcashRef(nearbyText);
    if (classic) return classic;

    const chunks = [];
    const pushChunk = (part) => {
      const digits = String(part || '').replace(/\D/g, '');
      if (!isUsableRefDigitChunk(digits, chunks.join(''))) return;
      chunks.push(digits);
    };

    const labelLine = lines[labelIndex];
    const sameLine = labelLine.match(
      /(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?|REFERENCE NUMBER)\s*[:#.\-]?\s*(.*)$/i
    );
    if (sameLine?.[1]) {
      const sameDigits = sameLine[1].match(/\d+/g) || [];
      sameDigits.forEach(pushChunk);
    }

    for (let i = labelIndex + 1; i < Math.min(lines.length, labelIndex + 5); i += 1) {
      const line = lines[i];
      if (/amount|total|transfer|sent via|download|share|help|carbon|footprint/i.test(line)) break;
      if (/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(line)) break;
      if (isDateNoiseToken(line.split(/\s+/)[0])) break;
      if (isYearToken(line.replace(/\D/g, '')) && chunks.join('').length >= 7) break;

      const digitParts = line.match(/\d+/g) || [];
      if (!digitParts.length) {
        if (chunks.length) break;
        continue;
      }

      // Date line like "02, 2025 7:56" — stop once prefix exists.
      if (
        chunks.join('').length >= 7 &&
        digitParts.some((part) => isYearToken(part) || isDayOrMonthNumberToken(part))
      ) {
        const sixDigit = digitParts.find((part) => part.replace(/\D/g, '').length === 6);
        if (sixDigit) pushChunk(sixDigit);
        break;
      }

      digitParts.forEach(pushChunk);
      if (chunks.join('').length >= 13) break;
    }

    let joined = chunks.join('');
    if (joined.length === 7) {
      for (let i = labelIndex + 1; i < Math.min(lines.length, labelIndex + 6); i += 1) {
        const line = lines[i];
        if (/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(line)) {
          // Still allow a 6-digit ref on/after a date line only if present as its own token
          // before year — but prefer earlier non-date lines.
          continue;
        }
        const six = (line.match(/\b(\d{6})\b/g) || []).find((part) => !isYearToken(part));
        if (six) {
          joined += six;
          break;
        }
      }
    }
    if (joined.length === 7) {
      // Last resort: any 6-digit token after the Ref label that is not a year.
      const after = lines.slice(labelIndex, labelIndex + 6).join(' ');
      const six = (after.match(/\b(\d{6})\b/g) || []).find((part) => !isYearToken(part));
      if (six) joined += six;
    }
    if (looksLikeRefMergedWithDate(joined)) {
      joined = joined.slice(0, 7);
    }
    if (joined.length >= 13) return joined.slice(0, 13);
    if (joined.length >= 11 && joined.length <= 16) return joined;
    return '';
  }

  function parseTransferFromTo(text, lines) {
    const phoneBit = '(?:\\+?\\s*63\\s*)?0?9(?:[\\s\\-]?\\d){9}';
    const inlineRe = new RegExp(
      'transfer\\s+from\\s+(' + phoneBit + ')\\s+to\\s+(' + phoneBit + ')',
      'i'
    );
    const inline = String(text || '').match(inlineRe);
    if (inline) {
      return {
        transferFrom: formatPhMobileDisplay(inline[1]),
        transferTo: formatPhMobileDisplay(inline[2]),
      };
    }

    for (let i = 0; i < lines.length; i += 1) {
      if (!/transfer\s+from/i.test(lines[i])) continue;
      const windowText = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]]
        .filter(Boolean)
        .join(' ');
      const match = windowText.match(inlineRe);
      if (match) {
        return {
          transferFrom: formatPhMobileDisplay(match[1]),
          transferTo: formatPhMobileDisplay(match[2]),
        };
      }

      const phones = extractPhoneCandidates(windowText);
      if (phones.length >= 2) {
        return { transferFrom: phones[0], transferTo: phones[1] };
      }
    }

    return { transferFrom: '', transferTo: '' };
  }

  function detectEwalletLayout(upper, compact) {
    const isGcashHistory =
      /TRANSACTION\s*DETAILS/.test(upper) ||
      /TRANSFER\s+FROM[\s\S]{0,80}\bTO\b/.test(upper) ||
      /REFERENCE\s*NUMBER/.test(upper);
    const isGcashReceipt =
      /EXPRESS\s*SEND/.test(upper) ||
      /SENT\s*VIA\s*GCASH/.test(upper) ||
      /TOTAL\s*AMOUNT\s*SENT/.test(upper) ||
      compact.includes('GCASH') ||
      /\bG\s*CASH\b/.test(upper);
    const isInstaPay = /INSTAPAY|INSTA\s*PAY/.test(upper) || compact.includes('INSTAPAY');
    const isPayPal = /PAYPAL/.test(compact);

    if (isPayPal) return { wallet: 'PayPal', layout: 'paypal' };
    if (isInstaPay && !isGcashReceipt && !isGcashHistory) {
      return { wallet: 'InstaPay', layout: 'instapay' };
    }
    if (/MAYA|PAYMAYA/.test(compact) && !isGcashHistory && !isGcashReceipt) {
      return { wallet: 'Maya', layout: 'maya' };
    }
    if (isGcashHistory) return { wallet: 'GCash', layout: 'gcash-history' };
    if (isGcashReceipt) return { wallet: 'GCash', layout: 'gcash-receipt' };
    if (compact.includes('GCASH') || /\bG\s*CASH\b/.test(upper)) {
      return { wallet: 'GCash', layout: 'gcash-receipt' };
    }
    return { wallet: 'Other', layout: 'unknown' };
  }

  function parseEwalletOcrText(text) {
    const raw = String(text || '')
      .replace(/\r/g, '')
      .replace(/[|]/g, 'I')
      .replace(/[₱]/g, 'PHP ')
      .replace(/[—–]/g, '-')
      .trim();
    const lines = raw
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const upper = raw.toUpperCase();
    const compact = upper.replace(/[^A-Z0-9]/g, '');
    const detected = detectEwalletLayout(upper, compact);
    let wallet = detected.wallet;
    const layout = detected.layout;

    let reference = extractClassicGcashRef(raw) || collectGcashReferenceAfterLabel(lines);

    if (!reference) {
      const labeledRef = raw.match(
        /(?:INSTAPAY\s*)?(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER|#)?|REFERENCE\s*NUMBER|TXN(?:\s*ID)?|TRANSACTION\s*(?:ID|NO\.?)?)\s*[:#.\-]?\s*([0-9][0-9 ]{8,24})/i
      );
      if (labeledRef?.[1] && !/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(labeledRef[1])) {
        const digitsOnly = labeledRef[1].replace(/\D/g, '');
        if (digitsOnly.length >= 11 && digitsOnly.length <= 16 && !looksLikeRefMergedWithDate(digitsOnly)) {
          reference = digitsOnly.length >= 13 ? digitsOnly.slice(0, 13) : digitsOnly;
        }
      }
    }

    if ((!reference || reference.length < 13) && /REF/i.test(upper)) {
      const refBlocks = [...upper.matchAll(/REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?\s*[:#.\-]?\s*([\s\S]{0,80})/g)];
      for (const block of refBlocks) {
        const nearby = String(block[1] || '');
        const classic = extractClassicGcashRef(nearby);
        if (classic) {
          reference = classic;
          break;
        }
        const stop = nearby.split(
          /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|AMOUNT|TOTAL|DOWNLOAD|SHARE|(?:19|20)\d{2})\b/i
        )[0];
        const parts = stop.match(/\d+/g) || [];
        const filtered = [];
        parts.forEach((part) => {
          if (isUsableRefDigitChunk(part, filtered.join(''))) filtered.push(part.replace(/\D/g, ''));
        });
        const digits = filtered.join('');
        if (digits.length >= 13 && !looksLikeRefMergedWithDate(digits)) {
          reference = digits.slice(0, 13);
          break;
        }
        if (digits.length >= 11 && digits.length <= 16 && !reference && !looksLikeRefMergedWithDate(digits)) {
          reference = digits;
        }
      }
    }

    if (!reference) {
      const spacedDigits = upper.match(/\b(\d{3,5}(?:[\s\-]+\d{2,5}){1,5})\b/g) || [];
      for (const candidate of spacedDigits) {
        if (/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(candidate)) continue;
        const digits = candidate.replace(/\D/g, '');
        if (digits.length === 13 && !looksLikeRefMergedWithDate(digits)) {
          reference = digits;
          break;
        }
      }
    }

    if (!reference) {
      const digitGroups = [...upper.matchAll(/\b(\d{11,16})\b/g)]
        .map((m) => m[1])
        .filter((digits) => !normalizePhMobile(digits) && !looksLikeRefMergedWithDate(digits));
      reference =
        digitGroups.find((d) => d.length === 13) ||
        digitGroups.find((d) => d.length === 12) ||
        digitGroups[0] ||
        '';
    }

    if (looksLikeRefMergedWithDate(reference)) {
      // Prefer classic pattern elsewhere in text instead of date-merged junk.
      reference = extractClassicGcashRef(raw) || '';
    }

    if (/[A-Za-z]/.test(reference) || /Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov/i.test(reference)) {
      reference = reference.replace(/[A-Za-z].*$/, '').replace(/\D/g, '');
      if (!(reference.length >= 11 && reference.length <= 16) || looksLikeRefMergedWithDate(reference)) {
        reference = '';
      }
    }

    let amount = null;
    const amountPatterns = [
      /(?:TOTAL\s*(?:AMOUNT\s*)?(?:SENT|PAID|TRANSFER(?:RED)?)?|AMOUNT\s*(?:SENT|PAID|TRANSFER(?:RED)?)?|YOU\s*SENT|TRANSFER\s*AMOUNT|AMOUNT)\s*[:\-]?\s*-?\s*(?:PHP|P)?\s*-?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /-\s*([\d,]+(?:\.\d{2}))/,
      /(?:PHP|P)\s*-?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /([\d,]+\.\d{2})/,
    ];
    for (const pattern of amountPatterns) {
      const match = raw.match(pattern);
      const parsed = parseMoneyToken(match?.[1]);
      if (parsed != null) {
        amount = parsed;
        break;
      }
    }

    let transferFrom = '';
    let transferTo = '';

    if (layout === 'gcash-history') {
      const parties = parseTransferFromTo(raw, lines);
      transferFrom = parties.transferFrom;
      transferTo = parties.transferTo;
    } else {
      const viaIndex = lines.findIndex((line) => /SENT VIA|VIA GCASH|VIA MAYA/i.test(line));
      if (viaIndex > 0) {
        const maybePhone = cleanOcrParty(lines[viaIndex - 1]);
        const maybeName = cleanOcrParty(lines[viaIndex - 2] || '');
        const phone = formatPhMobileDisplay(maybePhone);
        if (normalizePhMobile(maybePhone) || /\+?\s*63/.test(maybePhone)) {
          transferTo = [maybeName, phone].filter(Boolean).join(' · ');
        }
      }

      if (!transferTo) {
        const phones = extractPhoneCandidates(raw);
        if (phones[0]) transferTo = phones[0];
      }

      const parties = parseTransferFromTo(raw, lines);
      if (parties.transferFrom) transferFrom = parties.transferFrom;
      if (parties.transferTo) transferTo = parties.transferTo;

      if (!transferFrom) {
        const fromLabeled = lines.find((line) => /^FROM\s*[:\-]/.test(line));
        if (fromLabeled) transferFrom = cleanOcrParty(fromLabeled.replace(/^FROM\s*[:\-]?\s*/i, ''));
      }
    }

    if ((!transferFrom || !transferTo) && /transfer\s+from/i.test(raw)) {
      const parties = parseTransferFromTo(raw, lines);
      if (!transferFrom) transferFrom = parties.transferFrom;
      if (!transferTo) transferTo = parties.transferTo;
    }

    transferFrom = cleanOcrParty(transferFrom);
    transferTo = cleanOcrParty(transferTo);

    if (transferFrom && transferTo && transferFrom === transferTo) {
      transferFrom = '';
    }

    if (wallet === 'Other' && (/EXPRESS\s*SEND|REF\s*NO|TOTAL\s*AMOUNT\s*SENT|TRANSACTION\s*DETAILS|INSTAPAY|PAYPAL/i.test(upper))) {
      if (/PAYPAL/i.test(upper)) wallet = 'PayPal';
      else if (/INSTAPAY|INSTA\s*PAY/i.test(upper)) wallet = 'InstaPay';
      else wallet = 'GCash';
    }

    return {
      wallet,
      layout,
      reference,
      amount,
      transferFrom,
      transferTo,
      raw,
    };
  }


  /**
   * Document-scanner look: grayscale, auto-contrast, mild sharpen.
   * Used for preview, upload, Azure, and local OCR.
   */

  window.MoriReceiptOcrParse = {
    cleanOcrParty,
    parseMoneyToken,
    normalizePhMobile,
    formatPhMobileDisplay,
    extractPhoneCandidates,
    extractClassicGcashRef,
    collectGcashReferenceAfterLabel,
    parseTransferFromTo,
    detectEwalletLayout,
    parseEwalletOcrText,
  };
})();
