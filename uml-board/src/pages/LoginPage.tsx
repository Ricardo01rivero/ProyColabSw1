import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Container, Paper, TextField, Typography } from '@mui/material';
import { getLastUserName, normalizeUserName, setCurrentUserName } from '../lib/currentUser';

// Destinos permitidos después del login (evita redirecciones arbitrarias)
const ALLOWED_NEXT = ['/board/host', '/board/guest'];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next') || '';
  const next = ALLOWED_NEXT.includes(nextParam) ? nextParam : '/board/host';

  const [name, setName] = useState(getLastUserName());
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeUserName(name);
    if (clean.length < 2) {
      setError('Escribe tu nombre (mínimo 2 letras). La IA lo usará para dirigirse a ti en el chat.');
      return;
    }
    setCurrentUserName(clean);
    navigate(next);
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            UML Board
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom align="center" sx={{ mb: 3 }}>
            {next === '/board/guest'
              ? 'Te invitaron a una pizarra. Escribe tu nombre para entrar.'
              : 'Inicia sesión para continuar'}
          </Typography>
          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Tu nombre"
              helperText={error || 'Así te verán los demás y así te llamará la IA en el chat'}
              error={Boolean(error)}
              variant="outlined"
              margin="normal"
              autoFocus
              value={name}
              onChange={e => {
                setName(e.target.value);
                setError('');
              }}
            />
            <TextField
              fullWidth
              label="Contraseña (opcional)"
              type="password"
              variant="outlined"
              margin="normal"
            />
            <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 3 }}>
              {next === '/board/guest' ? 'Entrar como invitado' : 'Iniciar Sesión'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
