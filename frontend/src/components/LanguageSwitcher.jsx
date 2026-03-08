import { useContext } from 'react';
import { LanguageContext } from '../App';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const LanguageSwitcher = () => {
  const { language, switchLanguage } = useContext(LanguageContext);

  const languages = {
    en: { name: 'English', flag: '🇺🇸' },
    fr: { name: 'Français', flag: '🇫🇷' }
  };

  const currentLang = languages[language];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:bg-white/5 hover:text-green-400 flex items-center gap-1 p-1 md:p-2"
          data-testid="language-switcher"
        >
          <span className="text-base md:text-xl">{currentLang.flag}</span>
          <span className="hidden md:inline text-sm">{language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 bg-gray-900 border-white/10">
        <DropdownMenuItem 
          onClick={() => switchLanguage('en')}
          className={`cursor-pointer text-gray-300 hover:text-green-400 ${language === 'en' ? 'bg-white/5' : ''}`}
          data-testid="lang-en"
        >
          <span className="text-xl mr-2">🇺🇸</span>
          English
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => switchLanguage('fr')}
          className={`cursor-pointer text-gray-300 hover:text-green-400 ${language === 'fr' ? 'bg-white/5' : ''}`}
          data-testid="lang-fr"
        >
          <span className="text-xl mr-2">🇫🇷</span>
          Français
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
