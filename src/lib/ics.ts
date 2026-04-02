export interface ParsedIcsDayOff {
  date: string;
  description: string | null;
  isHalfDay: boolean;
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface ParsedIcsDateValue {
  kind: "date" | "date-time";
  date: string;
}

const DATE_ONLY_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/;

const formatNumber = (value: number) => String(value).padStart(2, "0");

const formatDate = (year: number, month: number, day: number) =>
  `${year}-${formatNumber(month)}-${formatNumber(day)}`;

const formatUtcDate = (date: Date) =>
  formatDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );

const formatLocalDate = (date: Date) =>
  formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());

const parseIsoDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const addDays = (value: string, amount: number) => {
  const date = parseIsoDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatUtcDate(date);
};

const enumerateDates = (startDate: string, endDateInclusive: string) => {
  const dates: string[] = [];
  const current = parseIsoDateOnly(startDate);
  const end = parseIsoDateOnly(endDateInclusive).getTime();

  while (current.getTime() <= end) {
    dates.push(formatUtcDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

const decodeIcsText = (value: string) =>
  value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();

const unfoldLines = (content: string) => {
  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    if (/^[ \t]/.test(rawLine) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
      continue;
    }

    lines.push(rawLine);
  }

  return lines;
};

const parseProperty = (line: string): IcsProperty | null => {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const rawIdentifier = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [rawName, ...rawParams] = rawIdentifier.split(";");
  const params: Record<string, string> = {};

  for (const rawParam of rawParams) {
    const paramSeparatorIndex = rawParam.indexOf("=");
    if (paramSeparatorIndex === -1) {
      params[rawParam.toUpperCase()] = "";
      continue;
    }

    const key = rawParam.slice(0, paramSeparatorIndex).toUpperCase();
    const paramValue = rawParam
      .slice(paramSeparatorIndex + 1)
      .replace(/^"(.*)"$/, "$1");
    params[key] = paramValue;
  }

  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
};

const parseDateValue = (
  value: string,
  valueType?: string
): ParsedIcsDateValue | null => {
  const normalizedValue = value.trim();
  const normalizedType = valueType?.toUpperCase();
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(normalizedValue);

  if (normalizedType === "DATE" || dateOnlyMatch) {
    const match = dateOnlyMatch;
    if (!match) {
      return null;
    }

    return {
      kind: "date",
      date: formatDate(Number(match[1]), Number(match[2]), Number(match[3])),
    };
  }

  const dateTimeMatch = DATE_TIME_PATTERN.exec(normalizedValue);
  if (!dateTimeMatch) {
    return null;
  }

  const year = Number(dateTimeMatch[1]);
  const month = Number(dateTimeMatch[2]) - 1;
  const day = Number(dateTimeMatch[3]);
  const hour = Number(dateTimeMatch[4]);
  const minute = Number(dateTimeMatch[5]);
  const second = Number(dateTimeMatch[6]);
  const isUtc = normalizedValue.endsWith("Z");

  const date = isUtc
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second);

  return {
    kind: "date-time",
    date: isUtc ? formatLocalDate(date) : formatLocalDate(date),
  };
};

const mergeDescriptions = (
  current: string | null,
  incoming: string | null
): string | null => {
  if (!current) return incoming;
  if (!incoming || current === incoming) return current;
  return `${current}; ${incoming}`;
};

const expandEvent = (properties: IcsProperty[]): ParsedIcsDayOff[] => {
  const startProp = properties.find((property) => property.name === "DTSTART");
  if (!startProp) {
    return [];
  }

  const endProp = properties.find((property) => property.name === "DTEND");
  const summaryProp = properties.find((property) => property.name === "SUMMARY");
  const start = parseDateValue(startProp.value, startProp.params.VALUE);
  const end = endProp ? parseDateValue(endProp.value, endProp.params.VALUE) : null;
  const description = summaryProp ? decodeIcsText(summaryProp.value) || null : null;

  if (!start) {
    return [];
  }

  if (start.kind === "date") {
    const endDateInclusive = end?.date ? addDays(end.date, -1) : start.date;
    if (endDateInclusive < start.date) {
      return [];
    }

    return enumerateDates(start.date, endDateInclusive).map((date) => ({
      date,
      description,
      isHalfDay: false,
    }));
  }

  const endDateInclusive = end?.date ?? start.date;

  return enumerateDates(start.date, endDateInclusive).map((date) => ({
    date,
    description,
    isHalfDay: false,
  }));
};

export const parseIcsDayOffs = (content: string): ParsedIcsDayOff[] => {
  const lines = unfoldLines(content);
  const events: IcsProperty[][] = [];
  let currentEvent: IcsProperty[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const upperLine = line.toUpperCase();

    if (upperLine === "BEGIN:VEVENT") {
      currentEvent = [];
      continue;
    }

    if (upperLine === "END:VEVENT") {
      if (currentEvent) {
        events.push(currentEvent);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const property = parseProperty(line);
    if (property) {
      currentEvent.push(property);
    }
  }

  const dayOffs = new Map<string, ParsedIcsDayOff>();

  for (const event of events) {
    for (const dayOff of expandEvent(event)) {
      const existing = dayOffs.get(dayOff.date);
      if (!existing) {
        dayOffs.set(dayOff.date, dayOff);
        continue;
      }

      dayOffs.set(dayOff.date, {
        ...existing,
        description: mergeDescriptions(existing.description, dayOff.description),
        isHalfDay: existing.isHalfDay && dayOff.isHalfDay,
      });
    }
  }

  return Array.from(dayOffs.values()).sort((left, right) =>
    left.date.localeCompare(right.date)
  );
};
