import { Card, CardContent } from "@acme/ui/card";

export function InfoCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-4">
        <span className="text-md font-bold">{title}</span>
        <div className="text-muted-foreground flex flex-col gap-4 text-sm">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
