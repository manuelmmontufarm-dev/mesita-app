"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const registerSchema = z.object({
  email: z.string().email("Correo inválido / Invalid email"),
  password: z.string()
    .min(8, "Mínimo 8 caracteres / At least 8 characters"),
  restaurantName: z.string()
    .min(2, "Nombre requerido / Name required")
    .max(100, "Nombre muy largo / Name too long"),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      restaurantName: "",
    },
  });

  async function onSubmit(data: RegisterFormData) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast({
          title: "Cuenta creada / Account created",
          description: "Por favor inicia sesión / Please sign in",
          variant: "default",
        });
        router.push("/login");
      } else if (response.status === 409) {
        toast({
          title: "Error",
          description: "Este correo ya está registrado / This email is already registered",
          variant: "destructive",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Error al crear cuenta / Error creating account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al conectar / Connection error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold text-zinc-900">Crear cuenta / Create account</CardTitle>
        <CardDescription className="text-zinc-600">
          ¿Eres propietario de restaurante en Quito? / Are you a restaurant owner in Quito?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-700">Correo / Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="tu@correo.com"
                      type="email"
                      disabled={isLoading}
                      className="h-12 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-700">Contraseña / Password</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Mínimo 8 caracteres"
                      type="password"
                      disabled={isLoading}
                      className="h-12 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="restaurantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-700">Nombre del restaurante / Restaurant name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Mi Restaurante"
                      disabled={isLoading}
                      className="h-12 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base bg-zinc-900 hover:bg-zinc-700 text-white font-medium"
            >
              {isLoading ? "Creando..." : "Crear cuenta / Create account"}
            </Button>
          </form>
        </Form>

        <div className="mt-6 text-center text-sm text-zinc-600">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-zinc-900 font-medium hover:underline">
            Inicia sesión / Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
