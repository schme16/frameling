// The file name offered when a reviewer saves the picture they were sent: the sharer's name for the drawing made plain
// (letters, numbers, dashes), then "-review.png". The name came over the link, so it is never used as it arrived.
export function pictureFileName(name: unknown): string {
  const stem =
    typeof name === 'string'
      ? name
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
          .replace(/-+$/g, '')
      : '';
  return `${stem || 'drawing'}-review.png`;
}
