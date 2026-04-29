import { useEffect, useMemo, useState, Fragment } from "react";
import { Copy, Check, RefreshCw, AlertCircle, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface XmlPreviewProps {
  url: string;
  className?: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; raw: string }
  | { status: "error"; message: string };

function formatXml(input: string): string {
  const trimmed = input.trim().replace(/>\s+</g, "><");
  let depth = 0;
  let out = "";
  let i = 0;

  while (i < trimmed.length) {
    if (trimmed[i] !== "<") {
      const next = trimmed.indexOf("<", i);
      const text = (next === -1 ? trimmed.slice(i) : trimmed.slice(i, next)).trim();
      if (text) out += text;
      i = next === -1 ? trimmed.length : next;
      continue;
    }

    const end = trimmed.indexOf(">", i);
    if (end === -1) {
      out += trimmed.slice(i);
      break;
    }
    const tag = trimmed.slice(i, end + 1);
    const isClosing = tag.startsWith("</");
    const isSelfClosing = tag.endsWith("/>") || tag.startsWith("<?") || tag.startsWith("<!");

    if (isClosing) depth = Math.max(0, depth - 1);
    out += (out.length ? "\n" : "") + "  ".repeat(depth) + tag;
    if (!isClosing && !isSelfClosing) depth += 1;

    i = end + 1;
  }

  return out;
}

type Token =
  | { type: "punct"; text: string }
  | { type: "tag"; text: string }
  | { type: "attr"; text: string }
  | { type: "value"; text: string }
  | { type: "text"; text: string }
  | { type: "meta"; text: string };

function tokenizeTag(raw: string): Token[] {
  if (raw.startsWith("<?") || raw.startsWith("<!")) {
    return [{ type: "meta", text: raw }];
  }

  const tokens: Token[] = [];
  const closing = raw.startsWith("</");
  const openLen = closing ? 2 : 1;
  const selfClosing = raw.endsWith("/>");
  const closeLen = selfClosing ? 2 : 1;
  const inner = raw.slice(openLen, raw.length - closeLen);

  tokens.push({ type: "punct", text: raw.slice(0, openLen) });

  const wsIdx = inner.search(/\s/);
  if (wsIdx === -1) {
    tokens.push({ type: "tag", text: inner });
  } else {
    tokens.push({ type: "tag", text: inner.slice(0, wsIdx) });
    const rest = inner.slice(wsIdx);
    const attrPattern = /(\s+)([\w:.-]+)(=)("[^"]*"|'[^']*')/g;
    let lastIndex = 0;
    for (const m of rest.matchAll(attrPattern)) {
      const idx = m.index ?? 0;
      if (idx > lastIndex) {
        tokens.push({ type: "punct", text: rest.slice(lastIndex, idx) });
      }
      tokens.push({ type: "punct", text: m[1] });
      tokens.push({ type: "attr", text: m[2] });
      tokens.push({ type: "punct", text: m[3] });
      tokens.push({ type: "value", text: m[4] });
      lastIndex = idx + m[0].length;
    }
    if (lastIndex < rest.length) {
      tokens.push({ type: "punct", text: rest.slice(lastIndex) });
    }
  }

  tokens.push({ type: "punct", text: raw.slice(raw.length - closeLen) });
  return tokens;
}

function tokenize(formatted: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formatted.length) {
    if (formatted[i] === "<") {
      const end = formatted.indexOf(">", i);
      if (end === -1) {
        tokens.push({ type: "text", text: formatted.slice(i) });
        break;
      }
      tokens.push(...tokenizeTag(formatted.slice(i, end + 1)));
      i = end + 1;
    } else {
      const next = formatted.indexOf("<", i);
      const slice = next === -1 ? formatted.slice(i) : formatted.slice(i, next);
      tokens.push({ type: "text", text: slice });
      i = next === -1 ? formatted.length : next;
    }
  }
  return tokens;
}

const TOKEN_CLASS: Record<Token["type"], string> = {
  punct: "text-ink-3",
  tag: "text-wine font-medium",
  attr: "text-clay",
  value: "text-moss",
  text: "text-ink",
  meta: "text-ink-3 italic",
};

export function XmlPreview({ url, className }: XmlPreviewProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setCopied(false);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((raw) => {
        if (!cancelled) setState({ status: "ready", raw });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Error desconocido";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const tokens = useMemo(() => {
    if (state.status !== "ready") return null;
    try {
      return tokenize(formatXml(state.raw));
    } catch {
      return [{ type: "text", text: state.raw } as Token];
    }
  }, [state]);

  const handleCopy = async () => {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-paper", className)}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-line bg-paper-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
          CFDI XML
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={state.status !== "ready"}
          className="h-7 text-[11px]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {state.status === "loading" && (
          <div className="flex items-center justify-center h-full text-ink-3">
            <div className="flex items-center gap-2 text-[12px]">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Cargando XML…
            </div>
          </div>
        )}
        {state.status === "error" && (
          <div className="flex items-center justify-center h-full text-ink-3">
            <div className="text-center">
              <AlertCircle className="h-7 w-7 mx-auto mb-2 opacity-40" />
              <p className="text-[13px] font-medium text-ink-2">
                No se pudo cargar el XML
              </p>
              <p className="text-[11px] mt-1">{state.message}</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer" download>
                  <Download className="h-3 w-3" />
                  Descargar
                </a>
              </Button>
            </div>
          </div>
        )}
        {state.status === "ready" && tokens && (
          <pre className="font-mono text-[11.5px] leading-[1.55] p-4 whitespace-pre-wrap break-all">
            {tokens.map((t, idx) => (
              <Fragment key={idx}>
                <span className={TOKEN_CLASS[t.type]}>{t.text}</span>
              </Fragment>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
