interface JQueryCollection {
  filter(selector: string): JQueryCollection;
  length: number;
}

declare function $(selector: string): JQueryCollection;
