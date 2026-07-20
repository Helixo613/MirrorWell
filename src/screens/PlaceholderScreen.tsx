import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { HomeHeader } from '@/components/home/HomeHeader';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';

export interface PlaceholderScreenProps {
  title: string;
  body: string;
}

export function PlaceholderScreen({ title, body }: PlaceholderScreenProps) {
  const navigate = useNavigate();
  const { settings } = useAppState();

  return (
    <ScreenShell textScale={settings.textScale}>
      <HomeHeader title={title} className="mb-6" />
      <p className="mb-8 text-base leading-relaxed text-muted-foreground">
        {body}
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => navigate('/home')}
      >
        {strings.placeholders.backToHome}
      </Button>
    </ScreenShell>
  );
}
