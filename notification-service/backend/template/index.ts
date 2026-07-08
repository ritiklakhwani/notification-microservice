export type TemplateName =
  | "signup-success"
  | "wallet-onramp-success"
  | "marketing-email";

interface RenderTemplateOptions {
  template: TemplateName;
  variables: Record<string, string | number>;
}

/**
 * Loads the HTML file for the given template and fills in its placeholders.
 * Placeholders are written as {{name}} inside the .html files and replaced
 * with the matching value from `variables`.
 */
export async function renderTemplate({ template, variables }: RenderTemplateOptions) {
  const templateUrl = new URL(`./${template}.html`, import.meta.url);
  let html = await Bun.file(templateUrl).text();

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, String(value));
  }

  return html;
}
