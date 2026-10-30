import { NavLink, Route, Routes } from 'react-router';
import { Ficha } from './paginas/Ficha.tsx';
import { Tablero } from './paginas/Tablero.tsx';

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--acento)" strokeWidth="3" />
      <circle cx="16" cy="16" r="5" fill="var(--acento)" />
    </svg>
  );
}

function Pronto({ titulo }: { titulo: string }) {
  return (
    <div className="cabecera">
      <h1>{titulo}</h1>
      <p className="tenue">Disponible en una próxima fase.</p>
    </div>
  );
}

export function App() {
  return (
    <div className="app">
      <nav className="lateral" aria-label="Principal">
        <div className="marca">
          <Logo /> Atención
        </div>
        <NavLink to="/" end>
          Tablero
        </NavLink>
        <NavLink to="/hoy">Hoy</NavLink>
        <NavLink to="/ritual">Ritual semanal</NavLink>
        <NavLink to="/mensual">Revisión mensual</NavLink>
        <NavLink to="/ajustes">Ajustes</NavLink>
        <p className="pie">Datos solo en tu equipo · data/app.db</p>
      </nav>
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Tablero />} />
          <Route path="/proyectos/:id" element={<Ficha />} />
          <Route path="/hoy" element={<Pronto titulo="Hoy" />} />
          <Route path="/ritual" element={<Pronto titulo="Ritual semanal" />} />
          <Route path="/mensual" element={<Pronto titulo="Revisión mensual" />} />
          <Route path="/ajustes" element={<Pronto titulo="Ajustes" />} />
          <Route path="*" element={<Pronto titulo="Página no encontrada" />} />
        </Routes>
      </main>
    </div>
  );
}
