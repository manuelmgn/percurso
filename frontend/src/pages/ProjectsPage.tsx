import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Loader2, Target } from "lucide-react"
import { projectsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Project } from "@/types"

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100)
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{current} de {total} lugares visitados</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-card p-0 text-left overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-200 w-full">
      <div className="relative h-28 bg-gradient-to-br from-purple-100 to-violet-200 dark:from-purple-900/30 dark:to-violet-800/30">
        {project.cover_image_url ? (
          <img src={project.cover_image_url} alt={project.title} className="h-full w-full object-cover" />
        ) : project.cover_image_generating ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Target className="size-10 text-purple-300" />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold leading-tight">{project.title}</h3>
        {project.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        )}
        <ProgressBar current={project.visited_place_count} total={project.target_place_count} />
      </div>
    </button>
  )
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [goal, setGoal] = useState("")
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: unknown) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md p-6 animate-fade-in">
        <h2 className="text-lg font-semibold mb-4">Novo projeto</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate({ title, description, goal_description: goal })
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Comarcas da Galiza" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descrição (opcional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição…" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Objetivo (opcional)</label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Visitar todas as comarcas…" />
          </div>
          {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : "Criar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const [showNew, setShowNew] = useState(false)
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} projetos ativos</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="size-4" />
          Novo projeto
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Target className="mx-auto mb-4 size-12 text-purple-300" />
          <h3 className="text-lg font-semibold mb-2">Ainda sem projetos</h3>
          <p className="text-muted-foreground mb-6">Cria um projeto para organizar as tuas metas de viagem.</p>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="size-4" />
            Criar projeto
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => {}} />
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
