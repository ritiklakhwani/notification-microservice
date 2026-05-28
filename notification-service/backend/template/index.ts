//TODO: HELPERS FOR RENDERING TEMPLATES

export type TemplateName =
  | "signup-success"
  | "wallet-onramp-success"
  | "marketing-email";

interface RenderTemplateOptions {
  template: TemplateName;
  variables: Record<string, string | number>;
}

declare const Bun: {
  file(path: URL): {
    text(): Promise<string>;
  };
};

export async function renderTemplate({ template, variables }: RenderTemplateOptions) {
  const templateUrl = new URL(`./${template}.html`, import.meta.url);
  let html = await Bun.file(templateUrl).text();

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, String(value));
  }

  return html;
}

// Example:
// const textHtml = await renderTemplate({
//   template: "wallet-onramp-success",
//   variables: { username: "Rahul", amount: 500 },
// });
