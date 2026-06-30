"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Restaurant {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  ownerEmail: string;
  createdAt: string;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRestaurants();
  }, []);

  async function loadRestaurants() {
    try {
      const response = await fetch("/api/admin/restaurants", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setRestaurants(data.data || []);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al cargar restaurantes",
        variant: "destructive",
      });
    }
  }

  async function updateRestaurantStatus(id: string, newStatus: "ACTIVE" | "SUSPENDED") {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Actualizado",
          description: `Restaurante ${newStatus === "ACTIVE" ? "activado" : "suspendido"}`,
          variant: "default",
        });
        loadRestaurants();
      } else {
        toast({
          title: "Error",
          description: "Error al actualizar restaurante",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error de conexión",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-4xl font-semibold text-zinc-900">Admin Panel</h1>
        <p className="text-zinc-600 mt-2">Gestiona todos los restaurantes</p>
      </div>

      {restaurants.length === 0 ? (
        <Card>
          <CardContent className="pt-12 text-center">
            <h3 className="text-lg font-semibold text-zinc-900">
              No hay restaurantes registrados
            </h3>
            <p className="text-zinc-600 mt-2">
              Los restaurantes aparecerán aquí cuando se registren.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Restaurantes registrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Propietario</TableHead>
                    <TableHead>Fecha de registro</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restaurants.map((restaurant) => (
                    <TableRow key={restaurant.id}>
                      <TableCell className="h-12 font-medium">
                        <Link
                          href={`/admin/restaurants/${restaurant.id}`}
                          className="hover:text-zinc-600 underline underline-offset-2 decoration-zinc-300"
                        >
                          {restaurant.name}
                        </Link>
                      </TableCell>
                      <TableCell className="h-12">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          restaurant.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : restaurant.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {restaurant.status === "ACTIVE" ? "Activo" : restaurant.status === "PENDING" ? "Pendiente" : "Suspendido"}
                        </span>
                      </TableCell>
                      <TableCell className="h-12">{restaurant.ownerEmail}</TableCell>
                      <TableCell className="h-12">{formatDate(restaurant.createdAt)}</TableCell>
                      <TableCell className="h-12 space-x-2">
                        {restaurant.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateRestaurantStatus(restaurant.id, "SUSPENDED")}
                            disabled={isLoading}
                            className="h-10"
                          >
                            Suspender
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRestaurantStatus(restaurant.id, "ACTIVE")}
                            disabled={isLoading}
                            className="h-10"
                          >
                            Activar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
