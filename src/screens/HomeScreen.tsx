import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';

export function HomeScreen() {
  const navigate = useNavigate();
  const { settings } = useAppState();

  return (
    <ScreenShell textScale={settings.textScale}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{strings.home.title}</h1>
        <p className="mt-2 text-muted-foreground">{strings.home.comingSoon}</p>
      </header>
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => navigate('/session')}
      >
        {strings.home.startExercises}
      </Button>
    </ScreenShell>
  );
}
