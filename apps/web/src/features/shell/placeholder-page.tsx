import { useTranslation } from 'react-i18next';

export function PlaceholderPage({
  titleKey,
  descriptionKey,
}: {
  titleKey: 'notFound.title';
  descriptionKey: 'notFound.description';
}) {
  const { t } = useTranslation();

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t(titleKey)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(descriptionKey)}</p>
    </section>
  );
}
