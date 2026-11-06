import { Badge, Card } from "@/components/ui";

interface Todo {
  text: string;
  tag: string;
  urgent: boolean;
}

export function UrgentTodoWidget({ todos = [] }: { todos?: Todo[] }) {
  return (
    <Card title="🔥 오늘의 긴급 할 일">
      {todos.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-400 font-bold">오늘 예정된 할 일이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {todos.map((todo) => (
            <label key={`${todo.tag}-${todo.text}`} className="flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition rounded-xl border border-gray-100 cursor-pointer">
              <div className="flex items-center gap-3">
                <input type="checkbox" className="w-5 h-5 rounded text-zinc-900 border-gray-300 focus:ring-zinc-900" />
                <span className="font-bold text-gray-700">{todo.text}</span>
              </div>
              <Badge variant={todo.urgent ? "default" : "info"}>{todo.tag}</Badge>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}
