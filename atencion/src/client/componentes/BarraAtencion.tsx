export function BarraAtencion({ porcentaje, titulo }: { porcentaje: number | null; titulo?: string }) {
  if (porcentaje === null) {
    return (
      <div className="atencion sin-dato" title={titulo}>
        <div className="barra" />
        <span className="valor">—</span>
      </div>
    );
  }
  return (
    <div className="atencion" title={titulo}>
      <div className="barra">
        <i style={{ width: `${porcentaje}%` }} />
      </div>
      <span className="valor">{porcentaje}%</span>
    </div>
  );
}
