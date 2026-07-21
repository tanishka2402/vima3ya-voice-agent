import fs from 'fs';
import path from 'path';
import { MenuItem } from './types';

/**
 * MenuService is the ONLY place that reads menu.json. Every other module must
 * go through it. This keeps grounding centralized: no component can invent an
 * item, price, or availability status that doesn't trace back to this file.
 */
export class MenuService {
  private readonly items: MenuItem[];

  constructor(menuPath: string = path.join(__dirname, '..', 'data', 'menu.json')) {
    const raw = fs.readFileSync(menuPath, 'utf-8');
    this.items = JSON.parse(raw) as MenuItem[];
  }

  getAll(): MenuItem[] {
    return this.items;
  }

  getById(id: string): MenuItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  getByCategory(category: MenuItem['category']): MenuItem[] {
    return this.items.filter((i) => i.category === category);
  }

  getAvailable(): MenuItem[] {
    return this.items.filter((i) => i.available);
  }

  /**
   * Finds the best matching menu item within a piece of free text.
   * Matches on the longest alias/name found (as a whole-word match, not a
   * raw substring - e.g. the alias "tea" must not match inside "instead"),
   * so that "I'll have the chicken 65 please" resolves to Chicken 65 rather
   * than a partial/looser match. Returns undefined if nothing matches.
   */
  findInText(text: string): { item: MenuItem; matchedText: string } | undefined {
    const all = this.findAllInText(text);
    if (all.length === 0) return undefined;
    return all.reduce((best, cur) => (cur.matchedText.length > best.matchedText.length ? cur : best));
  }

  /**
   * Finds ALL menu item mentions within a piece of text (not just the best
   * single match). Needed for compound utterances like
   * "the tikka masala and two fries" where more than one item is ordered
   * in a single clause. Overlapping matches at the same position keep only
   * the longest alias; results are returned in left-to-right order.
   */
  findAllInText(text: string): { item: MenuItem; matchedText: string; index: number }[] {
    const lower = text.toLowerCase();
    const found: { item: MenuItem; matchedText: string; index: number }[] = [];
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const item of this.items) {
      const candidates = [item.name.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())];
      let bestForItem: { matchedText: string; index: number } | undefined;
      for (const candidate of candidates) {
        // Allow a simple plural ("cokes" should still match alias "coke")
        const re = new RegExp(`\\b${escapeRegex(candidate)}s?\\b`);
        const match = re.exec(lower);
        if (match && (!bestForItem || candidate.length > bestForItem.matchedText.length)) {
          bestForItem = { matchedText: candidate, index: match.index };
        }
      }
      if (bestForItem) found.push({ item, ...bestForItem });
    }

    // Drop matches whose span is fully contained inside a longer match
    // (e.g. avoid double-counting if one alias is a substring of another item's alias).
    const filtered = found.filter((f) => {
      return !found.some(
        (other) =>
          other !== f &&
          other.index <= f.index &&
          other.index + other.matchedText.length >= f.index + f.matchedText.length &&
          other.matchedText.length > f.matchedText.length
      );
    });

    return filtered.sort((a, b) => a.index - b.index);
  }

  /**
   * Suggests a reasonable alternative when a requested item is unavailable.
   * Prefers an available item in the same category that shares dietary tags
   * with the unavailable one; falls back to any available item in the category.
   */
  suggestAlternative(unavailableItem: MenuItem): MenuItem | undefined {
    const sameCategory = this.items.filter(
      (i) => i.category === unavailableItem.category && i.available && i.id !== unavailableItem.id
    );
    if (sameCategory.length === 0) return undefined;

    const tagMatch = sameCategory.find(
      (i) =>
        i.tags.spicy === unavailableItem.tags.spicy &&
        i.tags.vegetarian === unavailableItem.tags.vegetarian
    );
    return tagMatch ?? sameCategory[0];
  }
}
