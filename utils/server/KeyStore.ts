import fs   from "fs";
import path from "path";

export enum KeyType {
	HIGHEST,
	GPT3 = 3,
	GPT4
}

interface Key {
	key: string;
	type: KeyType;
}

class KeyStore {
	private static initialized: Boolean = false;
	private static gpt3keys: string[]   = [];
	private static gpt4keys: string[]   = [];
	
	/**
	 * Load GPT keys from a key server or a local file.
	 * @returns {Promise<Key[]>} An array of GPT keys.
	 */
	private static async loadKeys (): Promise<Key[]> {
		const {OPENAI_API_KEY_SERVER, OPENAI_API_KEYS_FILE, OPENAI_API_KEY_SERVER_AUTH} = process.env;
		
		const fileContent = OPENAI_API_KEY_SERVER && OPENAI_API_KEY_SERVER_AUTH
		                    ? await this.getAllKeysFromKeyServer(OPENAI_API_KEY_SERVER, OPENAI_API_KEY_SERVER_AUTH)
		                    : this.readLocalKeysFile(OPENAI_API_KEYS_FILE ?? "keys.json");
		
		return JSON.parse(fileContent).map(({key, type}: { key: string; type: "gpt-3" | "gpt-4" }) => ({
			key,
			type: type === "gpt-3" ? KeyType.GPT3 : KeyType.GPT4
		}));
	}
	
	/**
	 * Read GPT keys from a local file.
	 * @param {string} filename The path to the local file containing GPT keys.
	 * @returns {string} The file content as a string.
	 */
	private static readLocalKeysFile (filename: string): string {
		const filePath = path.join(process.cwd(), filename);
		return fs.readFileSync(filePath, "utf-8");
	}
	
	/**
	 * Fetch all GPT keys from the key server.
	 * @param {string} server - The key server URL.
	 * @param {string} authKey - The authorization key used to access the server.
	 * @returns {Promise<string>} A string containing all GPT keys.
	 */
	private static async getAllKeysFromKeyServer (server: string, authKey: string): Promise<string> {
		return fetch(`http://${server}/getKeys`, {
			method : "POST",
			headers: {"Content-Type": "application/json"},
			body   : JSON.stringify({authKey: authKey})
		}).then(resp => resp.text());
	}
	
	/**
	 * Fetch a single GPT key from the key server.
	 * @param {string} server - The key server URL.
	 * @param {string} authKey - The authorization key used to access the server.
	 * @returns {Promise<string>} A string containing the GPT key.
	 */
	private static async getKeyFromKeyServer (server: string, authKey: string): Promise<string> {
		const keyResponse = await fetch(`http://${server}/getKey`, {
			method : "POST",
			headers: {"Content-Type": "application/json"},
			body   : JSON.stringify({authKey: authKey, keyType: "gpt-4"})
		}).then(resp => {
			if (resp.status === 503 && resp.statusText === "No keys available") throw new Error("No keys available");
			else if (resp.status === 404) throw new Error("Invalid access to the key server");
			return resp.json();
		});
		return keyResponse["key"];
	}
	
	/**
	 * Retrieves an API key for the specified GPT model.
	 *
	 * @param {KeyType} [type=KeyType.GPT4] - The type of GPT model for which the key is required (default is GPT4).
	 * @returns {Promise<string>} A promise that resolves to a randomly selected API key for the requested GPT model.
	 * @throws {Error} If no keys are available for the specified GPT model.
	 *
	 * @example
	 * // Get a GPT-3 key
	 * getKey(KeyType.GPT3).then(key => {
	 *   console.log(`GPT-3 key: ${key}`);
	 * });
	 *
	 * @example
	 * // Get a GPT-4 key
	 * getKey().then(key => {
	 *   console.log(`GPT-4 key: ${key}`);
	 * });
	 */
	public static async getKey (type: KeyType = KeyType.HIGHEST): Promise<string> {
		if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
		if (!this.initialized)
			(await this.loadKeys()).forEach(key => (key.type === KeyType.GPT4 ? this.gpt4keys : this.gpt3keys).push(key.key));
		const keys = type === KeyType.HIGHEST
		             ? (this.gpt4keys.length > 0 ? this.gpt4keys : this.gpt3keys)
		             : (type === KeyType.GPT3 && this.gpt3keys.length > 0 ? this.gpt3keys : this.gpt4keys);
		if (!keys.length) throw new Error(`No keys available for GPT-${type}`);
		this.initialized = true;
		return keys[Math.floor(Math.random() * keys.length)];
	}
	
	/**
	 * Deletes an API key.
	 *
	 * @param {string} key - The API key to be deleted.
	 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the key was successfully deleted or not.
	 * @throws {Error} If the key server is not configured.
	 *
	 * @example
	 * // Delete a GPT-3 or GPT-4 key
	 * deleteKey('your-api-key-here').then(success => {
	 *   if (success) {
	 *     console.log("API key successfully deleted");
	 *   } else {
	 *     console.log("Failed to delete API key");
	 *   }
	 * });
	 */
	public static async deleteKey (key: string): Promise<boolean> {
		const {OPENAI_API_KEY_SERVER, OPENAI_API_KEY_SERVER_AUTH} = process.env;
		if (!OPENAI_API_KEY_SERVER || !OPENAI_API_KEY_SERVER_AUTH) throw new Error("Key server not configured");
		const response   = await fetch(`http://${OPENAI_API_KEY_SERVER}/deleteKey`, {
			method : "POST",
			headers: {"Content-Type": "application/json"},
			body   : JSON.stringify({
				                        authKey: OPENAI_API_KEY_SERVER_AUTH,
				                        key    : key
			                        })
		}).then(resp => resp.json()) as { success: boolean };
		this.gpt3keys    = [];
		this.gpt4keys    = [];
		this.initialized = false;
		return response.success;
	}
}

export default KeyStore;