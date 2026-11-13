# Korte tekster til nyheder på forsiden

Forsiden viser de tre seneste nyheder med titel, dato og en kort tekst. Den korte tekst laves af `teaser()` i `lib/site/teaser.ts` ud fra nyhedens første afsnit. Før blev hele første afsnit vist (op til 300 tegn), og for korte nyheder var det hele nyheden.

## Reglerne

1. **Højst 160 tegn.** Det er omkring tre linjer i nyhedskolonnen (52ch bred). Tekst, der allerede er kortere, vises hel. At skære i den sparer næsten ingen plads og skjuler information.
2. **Hele sætninger først.** Så mange sætninger fra starten, som der er plads til. En hel sætning læses lettere end et brudstykke. Der sættes ikke prikker efter en hel sætning. Titlen er linket til resten.
3. **Ellers skæres ved et ord.** Er første sætning for lang, eller bliver de hele sætninger kortere end 60 tegn, skæres der ved et mellemrum, aldrig inde i et ord. Tegn som komma og kolon samt små bindeord ("og", "at", "i" …) fjernes i enden, og der sættes " …".
4. **Prikkerne på dansk.** Når hele ord er udeladt, står der mellemrum før de tre prikker ("lang tekst …"). Der bruges ét tegn (…).
5. **Punktum er ikke altid sætningsslut.** Punktum efter tal ("1. juni"), almindelige forkortelser ("fx.", "dvs.", "kl.") og forbogstaver ("H. C.") deler ikke teksten.
6. **Intet "Læs mere".** Titlen er linket. Ens "Læs mere"-links er svære at skimme og giver ingen mening, når en skærmlæser lister links op (WCAG 2.4.4, Link Purpose).
7. **Skæres i HTML, ikke med CSS.** CSS `line-clamp` skjuler kun teksten for øjet. En skærmlæser læser stadig det hele, og snittet falder midt i et ord. Ved at skære ved bygning får alle den samme korte tekst.

## Grænser

En nyhed på en enkelt kort sætning vises stadig hel på forsiden. Det er bevidst: så slipper man for at klikke for at læse én sætning.

Søgningen og siden "Alle nyheder" bruger stadig hele første afsnit.
