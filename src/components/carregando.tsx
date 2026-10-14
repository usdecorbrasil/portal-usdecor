import Image from 'next/image'

/**
 * Tela de carregamento com a marca.
 *
 * Usada pelos `loading.tsx` de cada área: o Next mostra isto assim que o
 * clique acontece e troca pelo conteúdo quando o servidor responde. O
 * cabeçalho e a navegação continuam na tela — só o miolo é substituído —,
 * então dá para clicar em outra aba sem esperar esta terminar.
 */
export default function Carregando({
  texto = 'Carregando',
}: {
  texto?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 py-20 sm:py-28"
    >
      <Image
        src="/logo.png"
        alt=""
        width={600}
        height={600}
        priority
        className="h-12 w-auto opacity-90 animate-[respira_1.6s_ease-in-out_infinite]"
      />

      {/* barra indeterminada: não sabemos quanto falta, só que está indo */}
      <div className="w-36 h-[3px] bg-[#E4E3DC] rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-[#131A2E] rounded-full animate-[desliza_1.2s_ease-in-out_infinite]" />
      </div>

      <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#9B9A93]">
        {texto}
      </p>
    </div>
  )
}
