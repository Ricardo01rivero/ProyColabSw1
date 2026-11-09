# UML Board - Diagramming ToolParcial 1 y 2 - Ingeniería de Software 1

A modern, web-based UML diagramming tool built with React, TypeScript, and Supabase.

## 🤝 Créditos y origen del proyecto

Este proyecto **parte de una base ya existente**: el proyecto *UML Board* desarrollado por
**Klaus Parada Burgos y Marcos Alexander Villarroel Siancas** (Ingeniería de Software I, semestre 3-2025),
cuyo repositorio original es https://github.com/daviddlv007/proyecto-software-1.
Esa base se usa con conocimiento de sus autores como punto de partida.

Este repositorio es una copia independiente (sin historial) sobre la cual se desarrollan y documentan
las extensiones propias, que se irán listando aquí:

- [ ] Vista de diagrama Entidad-Relación y exportación SQL
- [ ] IA que mueve/ordena clases
- [ ] Modo offline en la app Flutter generada
- [ ] Segundo parcial: chat compartido con IA asistente

## 🎯 Project Structure

```
proyecto-software-1/
├── uml-board/          # Main React/TypeScript application
│   ├── src/           # Application source code
│   ├── public/        # Static assets
│   └── dist/          # Build output
└── scripts/           # Utility scripts and tools
    ├── analyze_class_diagram.py    # Diagram analysis tools
    ├── test_query.py              # OpenAI API testing
    └── daily-backup.sh            # Automated backups
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Development
```bash
cd uml-board
npm install
npm run dev
```

### Production Build
```bash
cd uml-board
npm run build
```

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: Material-UI, ReactFlow
- **Database**: Supabase
- **Code Quality**: ESLint, Prettier, Husky
- **Deployment**: Static hosting compatible

## 📝 Features

- Interactive UML class diagram editor
- Real-time collaboration via Supabase
- Export/import capabilities
- Professional code generation tools
- Responsive design

## 🔧 Development Tools

- **ESLint**: Airbnb configuration with React/TypeScript rules
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks for quality assurance
- **TypeScript**: Strict type checking enabled

## 📚 Documentation

Additional documentation can be found in:
- `uml-board/CODING_STANDARDS.md` - Code style guide
- `scripts/README.md` - Utility scripts documentation

---

*Clean, focused, and professional UML diagramming solution.* 

# explication this funcionamiento del asistente UML
1.- escribir solicitud/pedido dentro de la caja de prompt
2.- pedido: crear o editar 
3.- procesa OPEN AI this pedido y ejecuta