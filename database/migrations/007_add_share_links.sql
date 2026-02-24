-- Agrega tabla share_links para links de comprobantes

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  token VARCHAR(255) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('factura', 'giftcard', 'liquidacion')),
  resource_id UUID,

  filename TEXT,
  mime_type TEXT,
  data_base64 TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_share_links_usuario_id ON share_links(usuario_id);
CREATE INDEX IF NOT EXISTS idx_share_links_tipo ON share_links(tipo);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);

COMMENT ON TABLE share_links IS 'Links públicos temporales para compartir comprobantes';
