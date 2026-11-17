/**
 * SeededRandom - Deterministic pseudo-random number generator
 * Uses Linear Congruential Generator (LCG) algorithm for reproducible random sequences
 * Same seed always produces identical sequences
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'string' ? this.hashSeed(seed) : Math.abs(seed);
  }

  /**
   * DJB2 hash algorithm - converts string to number
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  hashSeed(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  /**
   * Generate next random float in range [0, 1)
   * Uses LCG formula: (a * state + c) % m
   * @returns {number} Float between 0 and 1
   */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  /**
   * Generate random integer in range [min, max] (inclusive)
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @returns {number} Random integer
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random float in range [min, max)
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (exclusive)
   * @returns {number} Random float
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Select random element from array
   * @param {Array} array - Array to choose from
   * @returns {*} Random element from array
   */
  choice<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Shuffle array using Fisher-Yates algorithm (returns new array)
   * @param {Array} array - Array to shuffle
   * @returns {Array} New shuffled array
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Generate random boolean with given probability
   * @param {number} probability - Probability of true (0-1)
   * @returns {boolean} Random boolean
   */
  chance(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Select weighted random element from array
   * @param {Array} items - Array of items
   * @param {Array} weights - Array of weights (same length as items)
   * @returns {*} Selected item based on weights
   */
  weightedChoice<T>(items: T[], weights: number[]): T | undefined {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let random = this.next() * total;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    return items[items.length - 1];
  }

  /**
   * Return the current internal RNG state for snapshot/restore.
   * @returns {number} Opaque state value — pass to setState() to restore.
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restore internal RNG state from a previous getState() call.
   * Subsequent next() calls will produce the same sequence as before.
   * @param {number} s - State value from getState()
   */
  setState(s: number): void {
    this.state = s;
  }

  /**
   * Serialize RNG state to a plain object for snapshot persistence.
   * @returns {{ state: number }}
   */
  serialize(): { state: number } {
    return { state: this.state };
  }

  /**
   * Restore RNG state from a serialized snapshot.
   * @param {Object} data - Object from serialize()
   */
  deserialize(data: { state?: number } | null | undefined): void {
    if (data && typeof data.state === 'number') {
      this.state = data.state;
    }
  }
}
