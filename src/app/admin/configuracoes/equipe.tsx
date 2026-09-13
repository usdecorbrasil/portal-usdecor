'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  criarMembro,
  redefinirSenhaMembro,
  atualizarMembro,
  alternarMembroAtivo,
  arquivarMembro,
  restaurarMembro,
} from '@/app/actions/equipe'

export type Membro = {
  id: string
  nome: string | null
  email: string
  papel: 'admin' | 'funcionario' | 'financeiro'
  ativo: boolean
  souEu: boolean
}

const LABEL_PAPEL: Record<Membro['papel'], string> = {
  admin: 'Admin',
  financeiro: 'Financeiro',
  funcionario: 'Produção',
}

const COR_PAPEL: Record<Membro['papel'], string> = {
  admin: 'bg-[#131A2E] text-white',
  financeiro: 'bg-[#0090D8] text-white',
  funcionario: 'bg-[#E6EDEE] text-[#0090D8]',
}

export default function Equipe({
  membros,
  arquivados,
}: {
  membros: Membro[]
  arquivados: Membro[]
}) {
  const [aberto, setAberto] = useState(false)
  const [verArquivados, setVerArquivados] = useState(false)
  const [estado, acao, pendente] = useActionState(criarMembro, null)

  return (
    <section>
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        EQUIPE
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      <div className="flex flex-wrap gap-2">
        {!aberto && (
          <button
            onClick={() => setAberto(true)}
            className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide"
          >
            + CADASTRAR MEMBRO
          </button>
        )}

        {arquivados.length > 0 && (
          <button
            onClick={() => setVerArquivados((v) => !v)}
            className="border border-[#DDDCD5] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            {verArquivados ? 'OCULTAR' : 'VER'} ARQUIVADOS ({arquivados.length})
          </button>
        )}
      </div>

      {aberto && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-5 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold tracking-tight">Novo membro</h3>
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <form action={acao} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="eq-nome"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  NOME<span className="text-[#B00063] ml-1">*</span>
                </label>
                <input
                  id="eq-nome"
                  name="nome"
                  required
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
                />
              </div>

              <div>
                <label
                  htmlFor="eq-email"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  E-MAIL<span className="text-[#B00063] ml-1">*</span>
                </label>
                <input
                  id="eq-email"
                  name="email"
                  type="email"
                  required
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="eq-papel"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                PAPEL<span className="text-[#B00063] ml-1">*</span>
              </label>
              <select
                id="eq-papel"
                name="papel"
                required
                defaultValue="funcionario"
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white text-sm outline-none focus:border-[#131A2E]"
              >
                <option value="funcionario">
                  Produção — sem acesso a valores
                </option>
                <option value="financeiro">
                  Financeiro — contas a receber e limites de crédito
                </option>
                <option value="admin">Administrador — acesso total</option>
              </select>
            </div>

            {estado && !estado.ok && (
              <p className="text-sm text-[#B00063]">{estado.erro}</p>
            )}

            {estado?.ok && (
              <div className="bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-4">
                <p className="text-sm font-semibold text-[#2E7D4F] mb-2">
                  Membro cadastrado
                </p>
                <p className="text-xs mb-2">
                  Senha provisória — anote agora, ela não será exibida de novo:
                </p>
                <code className="block bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm break-all">
                  {estado.senha}
                </code>
                {estado.avisoEmail && (
                  <p className="text-[11px] text-[#8A6A00] bg-[#FBF0D9] border border-[#C79600] rounded-sm px-2 py-1.5 mt-2 leading-relaxed">
                    O e-mail com a senha não foi enviado ({estado.avisoEmail}). Passe a senha
                    acima por outro canal.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'CADASTRANDO...' : 'CADASTRAR'}
            </button>
          </form>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {membros.map((m) => (
          <CardMembro key={m.id} membro={m} />
        ))}
      </div>

      {verArquivados && arquivados.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            ARQUIVADOS
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h3>
          <div className="space-y-2">
            {arquivados.map((m) => (
              <CardArquivado key={m.id} membro={m} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function CardArquivado({ membro }: { membro: Membro }) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const emailOriginal = membro.email.replace(/^arquivado\+[^+]+\+/, '')

  function restaurar() {
    setErro('')
    iniciar(async () => {
      const r = await restaurarMembro(membro.id)
      if (!r.ok) setErro(r.erro)
      setConfirmando(false)
    })
  }

  return (
    <div className="bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm p-4 opacity-70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold tracking-tight">{membro.nome ?? '—'}</h3>
          <p className="text-xs text-[#6E6E68] mt-0.5 truncate">
            {emailOriginal}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-sm whitespace-nowrap ${COR_PAPEL[membro.papel]}`}
        >
          {LABEL_PAPEL[membro.papel]}
        </span>
      </div>

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}

      {confirmando ? (
        <div className="mt-3 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
          <p className="text-xs leading-relaxed mb-3">
            <strong>Restaurar {membro.nome}?</strong> O e-mail volta a ser{' '}
            <code className="font-mono">{emailOriginal}</code> e o acesso é
            reativado.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmando(false)}
              className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
            >
              VOLTAR
            </button>
            <button
              onClick={restaurar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? '...' : 'RESTAURAR'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmando(true)}
          className="w-full mt-3 border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
        >
          RESTAURAR
        </button>
      )}
    </div>
  )
}

function CardMembro({ membro }: { membro: Membro }) {
  const [senhaNova, setSenhaNova] = useState<string | null>(null)
  const [avisoEmail, setAvisoEmail] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [arquivando, setArquivando] = useState(false)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function novaSenha() {
    setErro('')
    iniciar(async () => {
      const r = await redefinirSenhaMembro(membro.id)
      if (r.ok) {
        setSenhaNova(r.senha)
        setAvisoEmail(r.avisoEmail ?? null)
      } else setErro(r.erro)
    })
  }

  function alternarAtivo() {
    setErro('')
    iniciar(async () => {
      const r = await alternarMembroAtivo(membro.id, !membro.ativo)
      if (!r.ok) setErro(r.erro)
      setConfirmando(false)
    })
  }

  function arquivar() {
    setErro('')
    iniciar(async () => {
      const r = await arquivarMembro(membro.id)
      if (!r.ok) setErro(r.erro)
      setArquivando(false)
    })
  }

  const emailTravado = membro.email.startsWith('arquivado+')
  const emailExibido = emailTravado
    ? membro.email.replace(/^arquivado\+[^+]+\+/, '')
    : membro.email

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold tracking-tight">
            {membro.nome ?? '—'}
            {membro.souEu && (
              <span className="ml-2 text-[10px] font-normal text-[#6E6E68]">
                você
              </span>
            )}
          </h3>
          <p className="text-xs text-[#6E6E68] mt-0.5">{emailExibido}</p>
          {emailTravado && (
            <p className="text-[10px] text-[#B00063] mt-0.5">
              E-mail travado no login — não consegue entrar até ser corrigido.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-sm whitespace-nowrap ${COR_PAPEL[membro.papel]}`}
          >
            {LABEL_PAPEL[membro.papel]}
          </span>
          {!membro.ativo && (
            <span className="text-xs bg-[#EAE9E3] text-[#6E6E68] px-2 py-0.5 rounded-sm">
              Inativo
            </span>
          )}
        </div>
      </div>

      {senhaNova && (
        <div className="mt-3 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-3">
          <p className="text-xs text-[#2E7D4F] font-semibold mb-1">
            Nova senha — anote agora
          </p>
          <code className="block bg-white border border-[#DDDCD5] rounded-sm px-2 py-1.5 font-mono text-sm break-all">
            {senhaNova}
          </code>
          {avisoEmail && (
            <p className="text-[11px] text-[#8A6A00] bg-[#FBF0D9] border border-[#C79600] rounded-sm px-2 py-1.5 mt-2 leading-relaxed">
              O e-mail com a senha não foi enviado ({avisoEmail}). Passe a senha
              acima por outro canal.
            </p>
          )}
        </div>
      )}

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}

      {editando && (
        <FormEditarMembro
          membro={membro}
          onFechar={() => setEditando(false)}
          onErro={setErro}
        />
      )}

      {arquivando ? (
        <div className="mt-3 border border-[#B00063] bg-[#FFF6FA] rounded-sm p-3">
          <p className="text-xs leading-relaxed mb-3">
            <strong>Arquivar {membro.nome}?</strong> O acesso é desativado e o
            e-mail <code className="font-mono">{membro.email}</code> fica
            livre para cadastrar outro usuário. O histórico de ações desse
            usuário é preservado.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setArquivando(false)}
              className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
            >
              VOLTAR
            </button>
            <button
              onClick={arquivar}
              disabled={pendente}
              className="bg-[#B00063] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? '...' : 'ARQUIVAR'}
            </button>
          </div>
        </div>
      ) : confirmando ? (
        <div className="mt-3 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
          <p className="text-xs leading-relaxed mb-3">
            <strong>
              {membro.ativo ? 'Desativar' : 'Reativar'} {membro.nome}?
            </strong>{' '}
            {membro.ativo
              ? 'O acesso ao portal é bloqueado imediatamente.'
              : 'O acesso volta a funcionar.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmando(false)}
              className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
            >
              VOLTAR
            </button>
            <button
              onClick={alternarAtivo}
              disabled={pendente}
              className="bg-[#C79600] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? '...' : 'CONFIRMAR'}
            </button>
          </div>
        </div>
      ) : !editando ? (
        <div className="grid grid-cols-4 gap-2 mt-3">
          <button
            onClick={novaSenha}
            disabled={pendente}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] disabled:opacity-50"
          >
            {pendente ? '...' : 'NOVA SENHA'}
          </button>
          <button
            onClick={() => setEditando(true)}
            disabled={pendente}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] disabled:opacity-50"
          >
            EDITAR
          </button>
          <button
            onClick={() => setConfirmando(true)}
            disabled={membro.souEu}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063] disabled:opacity-30"
          >
            {membro.ativo ? 'DESATIVAR' : 'REATIVAR'}
          </button>
          <button
            onClick={() => setArquivando(true)}
            disabled={membro.souEu}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063] disabled:opacity-30"
          >
            ARQUIVAR
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FormEditarMembro({
  membro,
  onFechar,
  onErro,
}: {
  membro: Membro
  onFechar: () => void
  onErro: (msg: string) => void
}) {
  const [nome, setNome] = useState(membro.nome ?? '')
  const [email, setEmail] = useState(membro.email)
  const [papel, setPapel] = useState<Membro['papel']>(membro.papel)
  const [pendente, iniciar] = useTransition()

  function salvar() {
    onErro('')
    iniciar(async () => {
      const r = await atualizarMembro(membro.id, { nome, email, papel })
      if (r.ok) onFechar()
      else onErro(r.erro)
    })
  }

  return (
    <div className="mt-3 border border-[#DDDCD5] bg-[#FAFAF7] rounded-sm p-3 space-y-3">
      <div>
        <label className="block text-[10px] tracking-widest text-[#6E6E68] mb-1">
          NOME
        </label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
        />
      </div>

      <div>
        <label className="block text-[10px] tracking-widest text-[#6E6E68] mb-1">
          E-MAIL
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
        />
      </div>

      <div>
        <label className="block text-[10px] tracking-widest text-[#6E6E68] mb-1">
          PAPEL
        </label>
        <select
          value={papel}
          disabled={membro.souEu}
          onChange={(e) => setPapel(e.target.value as Membro['papel'])}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E] disabled:opacity-50"
        >
          <option value="funcionario">Produção — sem acesso a valores</option>
          <option value="financeiro">Financeiro — contas a receber e limites de crédito</option>
          <option value="admin">Administrador — acesso total</option>
        </select>
        {membro.souEu && (
          <p className="text-[10px] text-[#6E6E68] mt-1">
            Você não pode alterar o próprio papel.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onFechar}
          className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
        >
          CANCELAR
        </button>
        <button
          onClick={salvar}
          disabled={pendente}
          className="bg-[#131A2E] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
        >
          {pendente ? 'SALVANDO...' : 'SALVAR'}
        </button>
      </div>
    </div>
  )
}