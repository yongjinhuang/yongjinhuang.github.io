export interface VaultInfo {
  readonly name: string;
  readonly label: string;
}

export interface InterviewFile {
  readonly slug: string;
  readonly filename: string;
  readonly title: string;
  readonly content: string;
  readonly category: string;
}

export interface InterviewCategory {
  readonly name: string;
  readonly label: string;
  readonly files: readonly InterviewFile[];
}
