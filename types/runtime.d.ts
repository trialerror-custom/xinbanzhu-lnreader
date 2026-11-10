declare module '@libs/fetch' {
  export function fetchApi(url: string, init?: RequestInit): Promise<Response>;
}
declare module '@libs/storage' {
  export const storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}
declare module '@libs/novelStatus' {
  export const NovelStatus: {
    Unknown: string;
    Ongoing: string;
    Completed: string;
  };
}
declare module '@libs/filterInputs' {
  export enum FilterTypes {
    TextInput = 'Text',
    Picker = 'Picker',
  }
}
