import { Link, NavLink, Route, Routes } from 'react-router';
import { Ajustes } from './paginas/Ajustes.tsx';
import { Ficha } from './paginas/Ficha.tsx';
import { Hoy } from './paginas/Hoy.tsx';
import { Mensual } from './paginas/Mensual.tsx';
import { Ritual } from './paginas/ritual/Ritual.tsx';
import { Tablero } from './paginas/Tablero.tsx';

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--acento)" strokeWidth="3" />
      <circle cx="16" cy="16" r="5" fill="var(--acento)" />
    </svg>
  );
}

function NoEncontrada() {
  return (
    <div className="pila">
      <h1>Página no encontrada</h1>
      <Link to="/">← Volver al tablero</Link>
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
          <Route path="/hoy" element={<Hoy />} />
          <Route path="/ritual" element={<Ritual />} />
          <Route path="/mensual" element={<Mensual />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </main>
    </div>
  );
}
