export function rolarAteOFim(marcador: HTMLElement | null) {
  const area = marcador?.closest<HTMLElement>('.rolagem')
  area?.scrollTo({ top: area.scrollHeight, behavior: 'smooth' })
}
