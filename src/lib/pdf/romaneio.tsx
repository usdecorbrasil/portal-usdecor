import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2 solid #131A2E',
    paddingBottom: 12,
    marginBottom: 16,
  },
  logoTexto: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#131A2E',
  },
  tituloRomaneio: {
    fontSize: 10,
    color: '#6E6E68',
    textAlign: 'right',
  },
  numeroGrande: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#131A2E',
    textAlign: 'right',
  },
  blocoResumo: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cartaoResumo: {
    flex: 1,
    border: '1 solid #DDDCD5',
    borderRadius: 4,
    padding: 10,
  },
  rotuloResumo: {
    fontSize: 8,
    color: '#6E6E68',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  valorResumo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#131A2E',
  },
  tabelaCabecalho: {
    flexDirection: 'row',
    backgroundColor: '#131A2E',
    padding: 6,
    borderRadius: 3,
  },
  tabelaCabecalhoTexto: {
    color: '#FFFFFF',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  linhaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: '1 solid #EEEDE7',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  imagem: {
    width: 56,
    height: 56,
    objectFit: 'cover',
    borderRadius: 3,
    marginRight: 10,
  },
  imagemVazia: {
    width: 56,
    height: 56,
    backgroundColor: '#EEEDE7',
    borderRadius: 3,
    marginRight: 10,
  },
  rodape: {
    marginTop: 24,
    paddingTop: 12,
    borderTop: '1 solid #DDDCD5',
    fontSize: 8,
    color: '#6E6E68',
    textAlign: 'center',
  },
})

export type ItemRomaneio = {
  sku: string
  nome: string
  quantidade: number
  imagemUrl: string | null
}

export type DadosRomaneio = {
  numero: number
  cliente: string
  rolos: number | null
  saldo: string | null
  metragemImpressa: number
  itens: ItemRomaneio[]
}

export function RomaneioDocumento({ pedidos }: { pedidos: DadosRomaneio[] }) {
  return (
    <Document>
      {pedidos.map((p) => (
        <Page key={p.numero} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.logoTexto}>Bello Tecido</Text>
            <View>
              <Text style={styles.tituloRomaneio}>ROMANEIO DE CALANDRA</Text>
              <Text style={styles.numeroGrande}>#{p.numero}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12 }}>
            {p.cliente}
          </Text>

          <View style={styles.blocoResumo}>
            <View style={styles.cartaoResumo}>
              <Text style={styles.rotuloResumo}>Metragem Impressa</Text>
              <Text style={styles.valorResumo}>
                {p.metragemImpressa.toFixed(2).replace('.', ',')} m
              </Text>
            </View>
            {p.rolos !== null && (
              <View style={styles.cartaoResumo}>
                <Text style={styles.rotuloResumo}>Rolos de Tecido</Text>
                <Text style={styles.valorResumo}>{p.rolos}</Text>
              </View>
            )}
            {p.saldo && (
              <View style={styles.cartaoResumo}>
                <Text style={styles.rotuloResumo}>Saldo</Text>
                <Text style={{ fontSize: 10, color: '#131A2E' }}>{p.saldo}</Text>
              </View>
            )}
          </View>

          <View style={styles.tabelaCabecalho}>
            <Text style={[styles.tabelaCabecalhoTexto, { width: 66 }]}>Img</Text>
            <Text style={[styles.tabelaCabecalhoTexto, { width: 70 }]}>SKU</Text>
            <Text style={[styles.tabelaCabecalhoTexto, { flex: 1 }]}>Produto</Text>
            <Text
              style={[
                styles.tabelaCabecalhoTexto,
                { width: 60, textAlign: 'right' },
              ]}
            >
              Qtd.
            </Text>
          </View>

          {p.itens.map((item, idx) => (
            <View key={idx} style={styles.linhaItem}>
              {item.imagemUrl ? (
                <Image src={item.imagemUrl} style={styles.imagem} />
              ) : (
                <View style={styles.imagemVazia} />
              )}
              <Text style={{ width: 62, fontSize: 9 }}>{item.sku}</Text>
              <Text style={{ flex: 1, fontSize: 9 }}>{item.nome}</Text>
              <Text style={{ width: 60, textAlign: 'right', fontSize: 9 }}>
                {item.quantidade} un
              </Text>
            </View>
          ))}

          <Text style={styles.rodape}>
            Documento de uso interno para produção — não contém valores comerciais.
          </Text>
        </Page>
      ))}
    </Document>
  )
}