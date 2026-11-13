import { useEffect, useState } from 'react'

export default function App() {
  const [estado, setEstado] = useState('verificando')

  useEffect(() => {
    fetch('/api/saude')
      .then((r) => r.json())
      .then((s) => setEstado(s.status === 'ok' ? 'no ar' : 'indisponível'))
      .catch(() => setEstado('indisponível'))
  }, [])

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-900">
      <div className="text-center">
        <h1 className="text-4xl font-semibold">Pulse</h1>
        <p className="mt-2 text-slate-600">Serviço: {estado}</p>
      </div>
    </main>
  )
}
