import { useNavigate } from 'react-router-dom';
import { Box, Button, Container, Paper, TextField, Typography } from '@mui/material';

export default function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/board/host');
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
            Inicia sesión para continuar
          </Typography>
          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Usuario"
              variant="outlined"
              margin="normal"
              autoFocus
            />
            <TextField
              fullWidth
              label="Contraseña"
              type="password"
              variant="outlined"
              margin="normal"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3 }}
            >
              Iniciar Sesión
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
