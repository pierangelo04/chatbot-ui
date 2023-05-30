export interface ProcessEnv {
  OPENAI_API_KEY_SERVER?: string;
  OPENAI_API_KEY_SERVER_AUTH?: string;
  OPENAI_API_KEYS_FILE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_HOST?: string;
  OPENAI_API_TYPE?: 'openai' | 'azure';
  OPENAI_API_VERSION?: string;
  OPENAI_ORGANIZATION?: string;
}
