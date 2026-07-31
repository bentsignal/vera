import { SimpleIcon } from "~/components/simple-icon";

function hasKey<T extends object>(
  obj: T,
  key: string,
): key is string & keyof T {
  return Object.hasOwn(obj, key);
}

export function Language({ className }: { className?: string }) {
  if (!className) return null;
  const language = className.split("-")[1];
  if (language && hasKey(languages, language)) {
    const { label, icon } = languages[language];
    return (
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-muted-foreground text-sm font-semibold">
          {label}
        </span>
      </div>
    );
  }
  return null;
}

const languages = {
  typescript: {
    label: "TypeScript",
    icon: <SimpleIcon icon="siTypescript" size={16} color="#3178C6" />,
  },
  javascript: {
    label: "JavaScript",
    icon: <SimpleIcon icon="siJavascript" size={16} color="#F7DF1E" />,
  },
  java: {
    label: "Java",
    icon: null,
  },
  tsx: {
    label: "React",
    icon: <SimpleIcon icon="siReact" size={16} color="#61DAFB" />,
  },
  jsx: {
    label: "React",
    icon: <SimpleIcon icon="siReact" size={16} color="#61DAFB" />,
  },
  bash: {
    label: "Bash",
    icon: <SimpleIcon icon="siGnubash" size={16} color="#4EAA25" />,
  },
  python: {
    label: "Python",
    icon: <SimpleIcon icon="siPython" size={16} color="#3776AB" />,
  },
  rust: {
    label: "Rust",
    icon: <SimpleIcon icon="siRust" size={16} color="#000000" />,
  },
  html: {
    label: "HTML",
    icon: <SimpleIcon icon="siHtml5" size={16} color="#E34F26" />,
  },
  css: {
    label: "CSS",
    icon: <SimpleIcon icon="siCss" size={16} color="#8A4FC4" />,
  },
  json: {
    label: "JSON",
    icon: <SimpleIcon icon="siJson" size={16} color="#000000" />,
  },
  yaml: {
    label: "YAML",
    icon: <SimpleIcon icon="siYaml" size={16} color="#CB171E" />,
  },
  markdown: {
    label: "Markdown",
    icon: <SimpleIcon icon="siMarkdown" size={16} color="#000000" />,
  },
  sql: {
    label: "SQL",
    icon: <SimpleIcon icon="siMysql" size={16} color="#4479A1" />,
  },
  c: {
    label: "C",
    icon: <SimpleIcon icon="siC" size={16} color="#A8B9CC" />,
  },
  cpp: {
    label: "C++",
    icon: <SimpleIcon icon="siCplusplus" size={16} color="#00599C" />,
  },
  csharp: {
    label: "C#",
    icon: null,
  },
  go: {
    label: "Go",
    icon: <SimpleIcon icon="siGo" size={16} color="#00ADD8" />,
  },
  swift: {
    label: "Swift",
    icon: <SimpleIcon icon="siSwift" size={16} color="#F05138" />,
  },
  kotlin: {
    label: "Kotlin",
    icon: <SimpleIcon icon="siKotlin" size={16} color="#7F52FF" />,
  },
  php: {
    label: "PHP",
    icon: <SimpleIcon icon="siPhp" size={16} color="#777BB4" />,
  },
  ruby: {
    label: "Ruby",
    icon: <SimpleIcon icon="siRuby" size={16} color="#CC342D" />,
  },
  scala: {
    label: "Scala",
    icon: <SimpleIcon icon="siScala" size={16} color="#DC322F" />,
  },
  haskell: {
    label: "Haskell",
    icon: <SimpleIcon icon="siHaskell" size={16} color="#5D4F85" />,
  },
  erlang: {
    label: "Erlang",
    icon: <SimpleIcon icon="siErlang" size={16} color="#A90533" />,
  },
  elixir: {
    label: "Elixir",
    icon: <SimpleIcon icon="siElixir" size={16} color="#4B275F" />,
  },
  dart: {
    label: "Dart",
    icon: <SimpleIcon icon="siDart" size={16} color="#0175C2" />,
  },
  svelte: {
    label: "Svelte",
    icon: <SimpleIcon icon="siSvelte" size={16} color="#FF3E00" />,
  },
  vue: {
    label: "Vue",
    icon: <SimpleIcon icon="siVuedotjs" size={16} color="#4FC08D" />,
  },
  solid: {
    label: "Solid",
    icon: <SimpleIcon icon="siSolid" size={16} color="#2C4F7C" />,
  },
  graphql: {
    label: "GraphQL",
    icon: <SimpleIcon icon="siGraphql" size={16} color="#E10098" />,
  },
  xml: {
    label: "XML",
    icon: null,
  },
  sass: {
    label: "Sass",
    icon: <SimpleIcon icon="siSass" size={16} color="#CC6699" />,
  },
  scss: {
    label: "SCSS",
    icon: <SimpleIcon icon="siSass" size={16} color="#CC6699" />,
  },
  angular: {
    label: "Angular",
    icon: <SimpleIcon icon="siAngular" size={16} color="#0F0F11" />,
  },
  R: {
    label: "R",
    icon: <SimpleIcon icon="siR" size={16} color="#276DC3" />,
  },
  lua: {
    label: "Lua",
    icon: <SimpleIcon icon="siLua" size={16} color="#2C2D72" />,
  },
  perl: {
    label: "Perl",
    icon: <SimpleIcon icon="siPerl" size={16} color="#0073A1" />,
  },
  objectivec: {
    label: "Objective-C",
    icon: null,
  },
  assembly: {
    label: "Assembly",
    icon: null,
  },
  wat: {
    label: "Web Assembly",
    icon: <SimpleIcon icon="siWebassembly" size={16} color="#654FF0" />,
  },
  watson: {
    label: "Web Assembly",
    icon: <SimpleIcon icon="siWebassembly" size={16} color="#654FF0" />,
  },
  zig: {
    label: "Zig",
    icon: <SimpleIcon icon="siZig" size={16} color="#F7A41D" />,
  },
  solidity: {
    label: "Solidity",
    icon: <SimpleIcon icon="siSolidity" size={16} color="#000000" />,
  },
};
