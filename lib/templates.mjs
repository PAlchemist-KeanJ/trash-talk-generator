// Card background templates: images in the "templates" blob store (full-size
// original + a lighter copy for visitors), settings in the templates table.
import { getStore } from "@netlify/blobs";

export const templateStore = () => getStore("templates");

export const originalKey = (id) => `templates/${id}/original`;
export const lightKey = (id) => `templates/${id}/light`;

// Changing the version in the URL means browsers and the CDN pick up a
// replaced image immediately, while unchanged images stay cached for a year.
export const templateVersion = (row) => new Date(row.image_updated_at || row.updated_at).getTime().toString(36);

export function publicTemplate(row) {
  const v = templateVersion(row);
  return {
    id: row.id,
    name: row.name,
    url: `/tpl-img/${row.id}/${v}`,
    originalUrl: `/tpl-orig/${row.id}/${v}`,
    mime: "",
    size: row.image_bytes || 0,
    versioned: true,
    driveUrl: "",
    textArea: {
      x: row.area_x,
      y: row.area_y,
      width: row.area_width,
      height: row.area_height,
      align: row.align,
      fontSizeRange: row.font_size_range || "",
    },
  };
}
